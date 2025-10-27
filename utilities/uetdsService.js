const soap = require("soap");
const moment = require("moment");

const UETDS_ENDPOINTS = {
    test: "https://servis.turkiye.gov.tr/services/g2g/kdgm/test/uetdsarizi?wsdl",
    prod: "https://servis.turkiye.gov.tr/services/g2g/kdgm/uetdsarizi?wsdl"
};

// Firma bilgilerini getir
async function getFirmCredentials(req) {
    const firm = await req.commonModels.Firm.findOne({ where: { key: req.tenantKey } });
    if (!firm) throw new Error("Firma bulunamadı.");

    if (firm.isUetdsTestMode) {
        return {
            wsdl: UETDS_ENDPOINTS.test,
            username: "999999",
            password: "999999testtest",
            plaka: "06TARIFESIZ123"
        };
    }

    if (!firm.uetdsUsername || !firm.uetdsPassword)
        throw new Error("UETDS kullanıcı adı veya şifre tanımlı değil.");

    return {
        wsdl: UETDS_ENDPOINTS.prod,
        username: firm.uetdsUsername.trim(),
        password: firm.uetdsPassword.trim(),
        plaka: firm.uetdsPlate?.trim()
    };
}

// Yardımcı: TripStopTime verilerinden offset map oluştur
function buildOffsetMap(offsets) {
    const map = {};
    for (const o of offsets) {
        map[o.routeStopId] = o.offsetMinutes || 0;
    }
    return map;
}

// Yardımcı: Duraklara göre saat hesapla
function computeRouteStopTimes(trip, routeStops, offsetMap) {
    const start = moment(`${trip.date} ${trip.time}`, "YYYY-MM-DD HH:mm");
    let current = start.clone();
    const result = [];

    for (const stop of routeStops) {
        const offset = offsetMap[stop.id] || 0;
        current = start.clone().add(offset, "minutes");
        result.push({
            stopId: stop.id,
            title: stop.title,
            time: current.format("HH:mm"),
            datetime: current.clone()
        });
    }
    return result;
}

// Ana fonksiyon: Sefer Ekle
async function seferEkle(req, tripId) {
    try {
        const { wsdl, username, password, plaka } = await getFirmCredentials(req);

        const trip = await req.models.Trip.findOne({
            where: { id: tripId },
            include: [
                {
                    model: req.models.Route,
                    as: "route",
                    include: [{ model: req.models.RouteStop, as: "stops" }]
                },
                { model: req.models.Bus, as: "bus", attributes: ["licensePlate", "phoneNumber"] }
            ]
        });

        if (!trip) throw new Error(`Trip bulunamadı: ${tripId}`);
        if (!trip.route?.stops?.length) throw new Error("Rota durak bilgisi eksik.");

        // Durakları sırala
        const routeStops = [...trip.route.stops].sort((a, b) => a.order - b.order);

        // TripStopTime tablosundan offsetleri al
        const offsets = await req.models.TripStopTime.findAll({ where: { tripId: trip.id }, raw: true });
        const offsetMap = buildOffsetMap(offsets);

        // Durak saatlerini hesapla
        const stopTimes = computeRouteStopTimes(trip, routeStops, offsetMap);
        const lastStopTime = stopTimes[stopTimes.length - 1];
        const seferBitis = lastStopTime.datetime || moment(trip.date).add(3, "hours"); // fallback 3 saat

        // SOAP argümanları
        const args = {
            wsuser: {
                kullaniciAdi: username,
                sifre: password
            },
            ariziSeferBilgileriInput: {
                aracPlaka: plaka || trip.bus?.licensePlate,
                seferAciklama: `${routeStops[0]?.title || ""} - ${routeStops[routeStops.length - 1]?.title || ""}`,
                hareketTarihi: moment(`${trip.date}`).format("YYYY-MM-DD"),
                hareketSaati: moment(trip.time, "HH:mm").format("HH:mm"),
                aracTelefonu: trip.bus?.phoneNumber || "5554443322",
                firmaSeferNo: `TRIP-${trip.id}`,
                seferBitisTarihi: seferBitis.format("YYYY-MM-DD"),
                seferBitisSaati: seferBitis.format("HH:mm")
            }
        };

        console.log("🚍 [UETDS] seferEkle isteği gönderiliyor...");
        console.table(args.ariziSeferBilgileriInput);

        const client = await soap.createClientAsync(wsdl);
        client.setSecurity(new soap.BasicAuthSecurity(username, password));
        const [result] = await client.seferEkleAsync(args);

        console.log("✅ [UETDS] seferEkle yanıtı:", result.return);

        // Kaydet
        if (result?.return?.uetdsSeferReferansNo) {
            trip.uetdsRefNo = result.return.uetdsSeferReferansNo;
            await trip.save();
        }

        return result.return;
    } catch (err) {
        console.error("❌ [UETDS] seferEkle Hatası:", err);
        throw err;
    }
}

module.exports = { seferEkle };
