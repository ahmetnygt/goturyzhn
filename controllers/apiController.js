const { Op } = require("sequelize");
const bcrypt = require("bcrypt")

// ----------------- HELPERLAR -----------------

function addMinutes(time, minutesToAdd) {
    if (!time) return null;
    const [h, m] = String(time).split(":").map(Number);
    let total = h * 60 + m + minutesToAdd;
    total = (total + 1440) % 1440;

    const hh = String(Math.floor(total / 60)).padStart(2, "0");
    const mm = String(total % 60).padStart(2, "0");
    return `${hh}:${mm}`;
}

function durationToMinutes(duration) {
    if (!duration) return 0;
    const parts = String(duration).split(":").map(Number);
    const h = parts[0] || 0;
    const m = parts[1] || 0;
    return h * 60 + m;
}

function calcDuration(start, end) {
    if (!start || !end) return "";

    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);

    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;

    if (endMin < startMin) endMin += 1440;

    const diff = endMin - startMin;
    const h = Math.floor(diff / 60);
    const m = diff % 60;

    return `${h} saat ${m} dakika`;
}

// planBinary: "010101..." → ["1","","2","3",...]
function generateSeatPlan(binary = "") {
    const plan = [];
    let seatNumber = 1;

    for (let i = 0; i < binary.length; i++) {
        if (binary[i] === "1") {
            plan[i] = String(seatNumber++);
        } else {
            plan[i] = "";
        }
    }

    return plan;
}

// Bus özelliklerini icon+label haline getir
function buildBusFeatures(bus) {
    if (!bus) return [];

    const features = [];

    if (bus.hasWifi) {
        features.push({
            key: "wifi",
            label: "Wi-Fi",
            icon: "/svg/feature-wifi.svg",
        });
    }
    if (bus.hasSeatScreen) {
        features.push({
            key: "seatScreen",
            label: "Koltuk Ekranı",
            icon: "/svg/feature-screen.svg",
        });
    }
    if (bus.hasPowerOutlet || bus.hasUsbPort) {
        features.push({
            key: "power",
            label: "Priz / USB",
            icon: "/svg/feature-power.svg",
        });
    }
    if (bus.hasCatering) {
        features.push({
            key: "catering",
            label: "İkram",
            icon: "/svg/feature-snack.svg",
        });
    }
    if (bus.hasComfortableSeat) {
        features.push({
            key: "comfortSeat",
            label: "Rahat Koltuk",
            icon: "/svg/feature-seat.svg",
        });
    }

    return features;
}

exports.getStops = async (req, res) => {
    try {
        const { Stop } = req.models;
        const tenantKey = req.tenantKey;

        // Bu firmanın aktif durakları
        const stops = await Stop.findAll({
            where: { isActive: true },
            attributes: ["id", "placeId", "title", "isActive"],
            order: [["title", "ASC"]]
        });

        return res.json({
            tenant: tenantKey,
            count: stops.length,
            stops
        });

    } catch (err) {
        console.error("STOP_LIST_ERROR:", err);
        return res.status(500).json({
            error: "Beklenmeyen bir hata oluştu",
            detail: err.message
        });
    }
};

exports.search = async (req, res) => {
    try {
        const {
            Trip,
            Route,
            RouteStop,
            Stop,
            Bus,
            BusModel,
            Price,
            TripStopTime,
            Ticket,
        } = req.models;

        const { from, to, date } = req.query;
        const tenantKey = req.tenantKey;

        if (!from || !to || !date) {
            return res
                .status(400)
                .json({ error: "from, to ve date zorunludur." });
        }

        // 1) placeId → stop çöz
        const fromStop = await Stop.findOne({ where: { placeId: from } });
        const toStop = await Stop.findOne({ where: { placeId: to } });

        if (!fromStop || !toStop) {
            return res.status(404).json({
                error: "From/To durak bulunamadı.",
            });
        }

        // 2) RouteStop → routeId listeleri
        const fromRouteStops = await RouteStop.findAll({
            where: { stopId: fromStop.id },
            attributes: ["routeId", "order"],
        });

        const toRouteStops = await RouteStop.findAll({
            where: { stopId: toStop.id },
            attributes: ["routeId", "order"],
        });

        const fromMap = {};
        fromRouteStops.forEach((rs) => (fromMap[rs.routeId] = rs.order));

        const toMap = {};
        toRouteStops.forEach((rs) => (toMap[rs.routeId] = rs.order));

        // 3) Doğru sıradaki rotalar
        const validRouteIds = [];
        for (const routeId of Object.keys(fromMap)) {
            if (toMap[routeId] && fromMap[routeId] < toMap[routeId]) {
                validRouteIds.push(Number(routeId));
            }
        }

        if (!validRouteIds.length) {
            return res.json({ tenant: tenantKey, count: 0, trips: [] });
        }

        // 4) Tripleri çek
        const trips = await Trip.findAll({
            where: {
                routeId: validRouteIds,
                date,
                isActive: true,
                isDeleted: false,
            },
            include: [
                { model: Bus, as: "bus", required: false },
                { model: BusModel, as: "busModel", required: false },
                {
                    model: TripStopTime,
                    as: "stopTimes",
                    required: false,
                    include: [{ model: RouteStop, as: "routeStop", required: true }],
                },
                { model: Route, as: "route", required: false },
            ],
            order: [["time", "ASC"]],
        });

        if (!trips.length) {
            return res.json({ tenant: tenantKey, count: 0, trips: [] });
        }

        // 5) RouteStop bilgilerini rotaya göre grupla
        const routeStopsMap = {};
        const allRouteStops = await RouteStop.findAll({
            where: { routeId: validRouteIds },
            order: [["order", "ASC"]],
        });

        for (const rs of allRouteStops) {
            if (!routeStopsMap[rs.routeId]) routeStopsMap[rs.routeId] = [];
            routeStopsMap[rs.routeId].push(rs);
        }

        // 5.1) Timeline için durak isimleri
        const stopIds = [
            ...new Set(allRouteStops.map((rs) => rs.stopId)),
        ];
        const allStopsForRoutes = await Stop.findAll({
            where: { id: stopIds },
            attributes: ["id", "title"],
        });
        const stopTitleById = {};
        allStopsForRoutes.forEach((s) => {
            stopTitleById[s.id] = s.title;
        });

        // 5.2) Koltuklar için Ticket'lar (dolu koltuklar)
        const tripIds = trips.map((t) => t.id);
        const occupiedStatuses = [
            "web",
            "gotur",
            "completed",
            "reservation",
            "pending",
        ]; // open, canceled, refund hariç

        const allTickets = await Ticket.findAll({
            where: {
                tripId: tripIds,
                status: occupiedStatuses,
                seatNo: { [Op.ne]: null },
            },
            attributes: ["tripId", "seatNo", "gender"],
        });

        const ticketsByTrip = {};
        allTickets.forEach((tic) => {
            if (!ticketsByTrip[tic.tripId]) ticketsByTrip[tic.tripId] = [];
            ticketsByTrip[tic.tripId].push(tic);
        });

        // 6) Trip formatlama (PUG uyumlu)
        const formattedTrips = [];

        for (const trip of trips) {
            const routeStops = routeStopsMap[trip.routeId];
            if (!routeStops || !routeStops.length) continue;

            const fromRS = routeStops.find(
                (rs) => rs.stopId === fromStop.id
            );
            const toRS = routeStops.find((rs) => rs.stopId === toStop.id);

            if (!fromRS || !toRS) continue;

            // base time hesaplama (ilk durağın saati trip.time kabul)
            function getBaseTime(targetRS) {
                let totalMinutes = 0;

                for (const rs of routeStops) {
                    if (rs.order === targetRS.order) break;
                    totalMinutes += durationToMinutes(rs.duration);
                }

                return addMinutes(trip.time, totalMinutes);
            }

            // offsetMinutes (TripStopTime) ile rötar
            function getFinalTime(routeStopId, baseTime) {
                const ts = trip.stopTimes?.find(
                    (st) => st.routeStopId === routeStopId
                );
                if (!ts) return baseTime;
                return addMinutes(baseTime, ts.offsetMinutes);
            }

            const fromBase = getBaseTime(fromRS);
            const fromFinal = getFinalTime(fromRS.id, fromBase);

            const toBase = getBaseTime(toRS);
            const toFinal = getFinalTime(toRS.id, toBase);

            const durationText = calcDuration(fromFinal, toFinal);

            // Fiyat
            let priceAmount = 0;

            let priceRow = await Price.findOne({
                where: { fromStopId: fromStop.id, toStopId: toStop.id }
            });

            if (!priceRow) {
                priceRow = await Price.findOne({
                    where: { fromStopId: toStop.id, toStopId: fromStop.id, isBidirectional: true }
                });
            }

            if (priceRow) {
                priceAmount =
                    priceRow.webPrice ??
                    priceRow.price1 ??
                    priceRow.price2 ??
                    priceRow.price3 ??
                    0;
            }


            // Bus plan + fullness + tickets
            const planBinary =
                (trip.busModel && trip.busModel.planBinary) ||
                (trip.busModel && trip.busModel.plan) ||
                "";

            const busPlan = planBinary ? generateSeatPlan(planBinary) : [];

            const totalSeats = planBinary
                ? planBinary.split("").filter((c) => c === "1").length
                : 0;

            const tripTickets = ticketsByTrip[trip.id] || [];

            const ticketsMap = {};
            tripTickets.forEach((tic) => {
                const key = String(tic.seatNo);
                ticketsMap[key] = {
                    gender: tic.gender,
                };
            });

            const occupiedSeatCount = tripTickets.length;
            const fullness =
                totalSeats > 0
                    ? Math.round((occupiedSeatCount / totalSeats) * 100)
                    : 0;

            // Bus özellikleri
            const busFeatures = buildBusFeatures(trip.bus);

            // Route timeline (sadece yolcunun bindiği kısım)
            const timelineStops = routeStops.filter(
                (rs) =>
                    rs.order >= fromRS.order && rs.order <= toRS.order
            );

            const routeTimeline = timelineStops.map((rs) => {
                const base = getBaseTime(rs);
                const finalTime = getFinalTime(rs.id, base);
                return {
                    time: finalTime,
                    title: stopTitleById[rs.stopId] || "",
                };
            });

            // Route açıklaması
            const routeDescription =
                (trip.route && trip.route.description) ||
                `${fromStop.title} - ${toStop.title}`;

            // PUG’un beklediği format
            formattedTrips.push({
                tripId: trip.id,
                routeId: trip.routeId,
                firm: tenantKey,

                fromStopId: fromStop.id,
                fromStr: fromStop.title,

                toStopId: toStop.id,
                toStr: toStop.title,

                // PUG: t.time, t.duration
                time: fromFinal,
                duration: durationText,

                date: trip.date,
                price: priceAmount,
                currency: "TRY",

                fullness,

                busFeatures,
                busPlanBinary: planBinary,
                busPlan,
                tickets: ticketsMap,

                routeDescription,
                routeTimeline,
            });
        }

        return res.json({
            tenant: tenantKey,
            count: formattedTrips.length,
            trips: formattedTrips,
        });
    } catch (err) {
        console.error("TRIP_SEARCH_ERROR:", err);
        res.status(500).json({
            error: "Beklenmeyen hata",
            detail: err.message,
        });
    }
};

exports.createPayment = async (req, res) => {
    try {
        const {
            tripId,
            fromStopId,
            toStopId,
            seatNumbers,
            genders
        } = req.body;

        const { TicketPayment } = req.commonModels;

        // 🔐 VALIDASYON
        if (!tripId || !fromStopId || !toStopId) {
            return res.status(400).json({
                error: "tripId, fromStopId ve toStopId zorunludur."
            });
        }

        if (!Array.isArray(seatNumbers) || seatNumbers.length === 0) {
            return res.status(400).json({
                error: "En az bir seatNumbers gönderilmelidir."
            });
        }

        if (!Array.isArray(genders) || genders.length !== seatNumbers.length) {
            return res.status(400).json({
                error: "genders array’i seatNumbers ile aynı uzunlukta olmalıdır."
            });
        }

        // 🔥 PAYMENT OLUŞTUR
        const payment = await TicketPayment.create({
            tripId,
            fromStopId,
            toStopId,
            seatNumbers,
            genders,
            isSuccess: false
        });

        return res.json({
            success: true,
            paymentId: payment.id
        });

    } catch (err) {
        console.error("PAYMENT_CREATE_ERROR:", err);
        return res.status(500).json({
            error: "Beklenmeyen hata",
            detail: err.message
        });
    }
};

exports.getPaymentDetail = async (req, res) => {
    try {
        const { Trip, Route, RouteStop, Stop, Price } = req.models;
        const { TicketPayment } = req.commonModels;

        const paymentId = req.params.id;

        // 1) Payment kaydını çek
        const payment = await TicketPayment.findByPk(paymentId);
        if (!payment) {
            return res.status(404).json({ error: "Payment bulunamadı." });
        }

        // 2) Trip’i çek
        const trip = await Trip.findOne({
            where: { id: payment.tripId },
            include: [
                {
                    model: Route, as: "route", include: [
                        {
                            model: RouteStop,
                            as: "stops",
                            include: [
                                { model: Stop, as: "stop" }
                            ]
                        }
                    ]
                }
            ]
        });

        if (!trip) {
            return res.status(404).json({ error: "Trip bulunamadı." });
        }

        // 3) Sefer durak bilgileri
        const fromStop = await Stop.findByPk(payment.fromStopId);
        const toStop = await Stop.findByPk(payment.toStopId);

        // 4) Fiyatı bul
        let price = await Price.findOne({
            where: {
                fromStopId: payment.fromStopId,
                toStopId: payment.toStopId
            }
        });

        if (!price) {
            price = await Price.findOne({
                where: {
                    fromStopId: payment.toStopId,
                    toStopId: payment.fromStopId,
                    isBidirectional: true
                }
            });
        }

        const perSeat = price?.webPrice || price?.price1 || 0;
        const totalPrice = perSeat * payment.seatNumbers.length;

        // 5) JSON formatını hazırla
        return res.json({
            paymentId,
            trip: {
                fromStr: fromStop?.title,
                toStr: toStop?.title,
                date: trip.date,
                time: trip.time,
            },
            seatNumbers: payment.seatNumbers,
            genders: payment.genders,
            perSeat,
            totalPrice
        });

    } catch (err) {
        console.error("PAYMENT_DETAIL_ERROR:", err);
        return res.status(500).json({
            error: "Beklenmeyen hata",
            detail: err.message
        });
    }
};

exports.paymentComplete = async (req, res) => {
    try {
        const { Ticket, TicketGroup } = req.models;
        const { TicketPayment } = req.commonModels;
        const pay = await TicketPayment.findByPk(req.params.id);
        if (!pay) return res.json({ error: "payment yok" });

        const tg = await TicketGroup.create({ tripId: pay.tripId })

        for (const i in pay.seatNumbers) {
            await Ticket.create({
                tripId: pay.tripId,
                ticketGroupId: tg.id,
                seatNo: pay.seatNumbers[i],
                gender: pay.genders[i],
                status: "web",
                nationality: "TR"
            });
        }

        console.log(req.models)
        console.log(req.commonModels)
        console.log(pay)

        await pay.update({ isSuccess: true });
        res.json({ ok: true, paymentId: pay.id });

    } catch (e) { console.log(e); res.json({ error: e.message }) }
}

exports.register = async (req, res) => {
    try {
        const { Customer } = req.models;
        const { name, surname, phone, password, email, gender, idNumber } = req.body;

        // idNumber zorunlu hale geldi
        if (!idNumber || !phone || !password || !name || !surname) {
            return res.status(400).json({ error: "Lütfen tüm zorunlu alanları doldurunuz." });
        }

        if (idNumber.length !== 11) {
            return res.status(400).json({ error: "Geçersiz T.C. Kimlik Numarası." });
        }

        // Mükerrer kontrolü artık TCKN üzerinden
        const existing = await Customer.findOne({ where: { idNumber: idNumber } });
        if (existing) {
            return res.status(409).json({ error: "Bu T.C. Kimlik Numarası ile kayıtlı kullanıcı var." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const customer = await Customer.create({
            name: name.toLocaleUpperCase("tr-TR"),
            surname: surname.toLocaleUpperCase("tr-TR"),
            nationality: "tr",
            customerType: "adult",
            phoneNumber: phone,
            password: hashedPassword,
            email: email || null,
            gender: gender || null,
            idNumber: idNumber, // TCKN kaydediliyor
            customerCategory: "member",
            pointOrPercent: "point"
        });

        const userObj = customer.toJSON();
        delete userObj.password;

        res.json({ success: true, user: userObj });

    } catch (err) {
        console.error("REGISTER_ERR:", err);
        res.status(500).json({ error: "Kayıt sırasında hata oluştu.", detail: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { Customer } = req.models;
        // phone yerine idNumber alıyoruz
        const { idNumber, password } = req.body;

        if (!idNumber || !password) {
            return res.status(400).json({ error: "T.C. Kimlik No ve şifre gereklidir." });
        }

        // Kullanıcıyı TCKN ile bul
        const customer = await Customer.findOne({ where: { idNumber: idNumber } });
        if (!customer) {
            return res.status(401).json({ error: "Kullanıcı bulunamadı." });
        }

        if (!customer.password) {
            return res.status(401).json({ error: "Bu kullanıcının şifresi oluşturulmamış." });
        }

        const match = await bcrypt.compare(password, customer.password);
        if (!match) {
            return res.status(401).json({ error: "Hatalı şifre." });
        }

        const userObj = customer.toJSON();
        delete userObj.password;

        res.json({ success: true, user: userObj });

    } catch (err) {
        console.error("LOGIN_ERR:", err);
        res.status(500).json({ error: "Giriş hatası.", detail: err.message });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const { Customer } = req.models;
        const { id } = req.params;

        if (!id) return res.status(400).json({ error: "ID gerekli." });

        const customer = await Customer.findByPk(id, {
            attributes: { exclude: ['password'] } // Şifreyi gönderme
        });

        if (!customer) {
            return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        }

        res.json({ success: true, user: customer });
    } catch (err) {
        console.error("GET_PROFILE_ERR:", err);
        res.status(500).json({ error: "Profil bilgisi alınamadı." });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { Customer } = req.models;
        const { id, name, surname, email, gender, password } = req.body;

        if (!id) return res.status(400).json({ error: "Kullanıcı ID eksik." });

        const customer = await Customer.findByPk(id);
        if (!customer) {
            return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        }

        // Güncellenecek veriler
        const updateData = {
            name: name ? name.toLocaleUpperCase("tr-TR") : customer.name,
            surname: surname ? surname.toLocaleUpperCase("tr-TR") : customer.surname,
            email: email,
            gender: gender
        };

        // Eğer şifre de geldiyse hashleyip güncelle
        if (password && password.trim() !== "") {
            updateData.password = await bcrypt.hash(password, 10);
        }

        await customer.update(updateData);

        // Güncel halini geri dön
        const userObj = customer.toJSON();
        delete userObj.password;

        res.json({ success: true, user: userObj });

    } catch (err) {
        console.error("UPDATE_PROFILE_ERR:", err);
        res.status(500).json({ error: "Güncelleme sırasında hata oluştu.", detail: err.message });
    }
};

// Müşterinin Biletlerini Getir (Gelişmiş Saat Hesaplamalı)
exports.getCustomerTickets = async (req, res) => {
    try {
        const { Ticket, Trip, Stop, Route, RouteStop, TripStopTime } = req.models;
        const { id } = req.params; // id: TCKN

        const tickets = await Ticket.findAll({
            include: [
                {
                    model: req.models.Customer,
                    as: "customer",
                    where: { idNumber: id },
                    attributes: []
                },
                {
                    model: Trip,
                    as: "trip",
                    attributes: ["id", "date", "time"],
                    include: [
                        {
                            model: TripStopTime,
                            as: "stopTimes",
                            attributes: ["routeStopId", "offsetMinutes"]
                        },
                        {
                            model: Route,
                            as: "route",
                            attributes: ["title", "routeCode"],
                            include: [
                                {
                                    model: RouteStop,
                                    as: "stops",
                                    attributes: ["id", "order", "duration"],
                                    include: [{ model: Stop, as: "stop", attributes: ["title"] }]
                                }
                            ]
                        }
                    ]
                }
            ],
            order: [
                [{ model: Trip, as: "trip" }, 'date', 'DESC'],
                [{ model: Trip, as: "trip" }, 'time', 'DESC']
            ]
        });

        // Detaylı Saat ve Durak Hesaplaması
        const processedTickets = tickets.map(t => {
            const ticket = t.toJSON();
            const trip = ticket.trip;
            const routeStops = trip.route?.stops || [];

            // Durakları sıraya diz (Garanti olsun)
            routeStops.sort((a, b) => a.order - b.order);

            // --- KALKIŞ SAATİ HESABI ---
            // Biletin alındığı durak (fromRouteStopId)
            const fromRS = routeStops.find(rs => rs.id == ticket.fromRouteStopId);
            let depMinutesToAdd = 0;

            if (fromRS) {
                // O durağa kadar geçen süreleri topla
                for (const rs of routeStops) {
                    console.log(rs.id, rs.order)
                    console.log(fromRS.id, fromRS.order)
                    if (rs.order > fromRS.order) break;
                    depMinutesToAdd += durationToMinutes(rs.duration);
                }
                // Varsa o durağın rötarını/offsetini ekle
                const offset = trip.stopTimes?.find(st => st.routeStopId == ticket.fromRouteStopId)?.offsetMinutes || 0;
                depMinutesToAdd += offset;

                // Durak ismini düzelt (Ticket ilişkisi hatalıysa buradan alırız)
                ticket.fromStopTitle = fromRS.stop?.title;
            }
            ticket.calculatedDeparture = addMinutes(trip.time, depMinutesToAdd);


            // --- VARIŞ SAATİ HESABI ---
            // Biletin inileceği durak (toRouteStopId)
            const toRS = routeStops.find(rs => rs.id == ticket.toRouteStopId);
            let arrMinutesToAdd = 0;

            if (toRS) {
                for (const rs of routeStops) {
                    if (rs.order > toRS.order) break;
                    arrMinutesToAdd += durationToMinutes(rs.duration);
                }
                const offset = trip.stopTimes?.find(st => st.routeStopId == ticket.toRouteStopId)?.offsetMinutes || 0;
                arrMinutesToAdd += offset;

                ticket.toStopTitle = toRS.stop?.title;
            }
            ticket.calculatedArrival = addMinutes(trip.time, arrMinutesToAdd);

            return ticket;
        });

        res.json({ success: true, tickets: processedTickets });

    } catch (err) {
        console.error("GET_TICKETS_ERR:", err);
        res.status(500).json({ error: "Biletler alınamadı.", detail: err.message });
    }
};

// Bilet İptal / İade
exports.cancelTicket = async (req, res) => {
    try {
        const { Ticket } = req.models;
        const { ticketId, action } = req.body; // action: 'cancel' (iptal) veya 'refund' (iade)

        const ticket = await Ticket.findByPk(ticketId);
        if (!ticket) {
            return res.status(404).json({ error: "Bilet bulunamadı." });
        }

        // Tarih kontrolü (Geçmiş sefer iptal edilemez)
        const tripDate = new Date(ticket.optionDate + " " + ticket.optionTime); // Modeldeki tarih alanı
        // Basit kontrol, detaylısı trip modelinden yapılmalı

        const newStatus = action === "refund" ? "refund" : "canceled";

        await ticket.update({ status: newStatus });

        res.json({ success: true, message: "İşlem başarılı." });

    } catch (err) {
        console.error("CANCEL_TICKET_ERR:", err);
        res.status(500).json({ error: "İşlem başarısız." });
    }
};