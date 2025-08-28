var express = require('express');
var router = express.Router();
const bcrypt = require("bcrypt")
const { Op } = require('sequelize');
const BusModel = require("../models/busModelModel")
const Bus = require("../models/busModel")
const Captain = require("../models/captainModel")
const Place = require("../models/placeModel")
const Route = require("../models/routeModel")
const RouteStop = require("../models/routeStopModel");
const Stop = require("../models/stopModel")
const Trip = require('../models/tripModel');
const Ticket = require('../models/ticketModel');
const Customer = require('../models/customerModel');
const TicketGroup = require('../models/ticketGroupModel');
const TripNote = require("../models/tripNoteModel")
const Firm = require("../models/firmModel")
const FirmUser = require("../models/firmUserModel")
const Branch = require("../models/branchModel")
const CashRegister = require("../models/cashRegisterModel")
const Transaction = require("../models/transactionModel")
const SystemLog = require("../models/systemLogModel")
const Price = require("../models/priceModel")

let places;
Place.findAll().then(p => { places = p }).catch(err => console.log(err))

async function generatePNR(fromId, toId) {
    const from = await places.find(p => p.id == fromId).title;
    const to = await places.find(p => p.id == toId).title;
    const turkishMap = { "Ç": "C", "Ş": "S", "İ": "I", "Ğ": "G", "Ü": "U", "Ö": "O", "ç": "C", "ş": "S", "ı": "I", "ğ": "G", "ü": "U", "ö": "O" };

    const clean = str => str
        .split('')
        .map(c => turkishMap[c] || c)
        .join('')
        .toUpperCase()
        .substring(0, 2);

    const fromCode = clean(from);
    const toCode = clean(to);

    let pnr;
    let exists = true;

    while (exists) {
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 karakter
        pnr = `${fromCode}${toCode}${rand}`;
        exists = await Ticket.findOne({ where: { pnr } }); // Sequelize'de sorgu
    }

    return pnr;
}

function emptyLikeToNull(value) {
    if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
    ) {
        return null;
    }
    return value;
}

function convertEmptyFieldsToNull(obj) {
    const result = {};
    for (const key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) {
            result[key] = emptyLikeToNull(obj[key]);
        }
    }
    return result;
}

async function getDaysTripsFormatted(date) {
    let trip = await Trip.findOne({ where: { date: date } })
    let routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId } })
    let busModel = await BusModel.findOne({ where: { id: trip.busModelId } })
    let tripDate = new Date(trip.date)
    let ddmm = `${tripDate.getDate()}/${tripDate.getMonth() + 1}`
    return { date: ddmm, time: trip.time, title: `${routeStops[0].placeId} -> ${routeStops[routeStops.length - 1].placeId}`, busModel: busModel.title }
}

function addTime(baseTime, addTime) {
    // "12:30:00" ve "01:00:00" gibi stringleri alır
    const [h1, m1, s1] = baseTime.split(":").map(Number);
    const [h2, m2, s2] = addTime.split(":").map(Number);

    // toplam saniye
    let totalSeconds = (h1 * 3600 + m1 * 60 + s1) + (h2 * 3600 + m2 * 60 + s2);

    // 24 saati geçerse mod 24 yap
    totalSeconds = totalSeconds % (24 * 3600);

    // geri formatla
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor(totalSeconds % 3600 / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");

    return `${hh}:${mm}:${ss}`;
}

exports.getDayTripsList = async (req, res, next) => {
    try {
        const date = req.query.date;
        const placeId = req.query.placeId;
        const tripId = req.query.tripId

        if (!date) {
            return res.status(400).json({ error: "Tarih bilgisi eksik." });
        }

        // Tarih geçerli mi?
        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ error: "Geçersiz tarih formatı." });
        }

        const routeStopsByPlace = await RouteStop.findAll({ where: { placeId: placeId } })
        const routeIds = [...new Set(routeStopsByPlace.map(s => s.routeId))];

        const trips = await Trip.findAll({ where: { date: date, routeId: { [Op.in]: routeIds } }, order: [["time", "ASC"]] });

        var newTrips = []
        for (let i = 0; i < trips.length; i++) {
            const t = trips[i];
            t.modifiedTime = t.time
            console.log(t.id)
            console.log(t.modifiedTime)

            const routeStops = await RouteStop.findAll({ where: { routeId: t.routeId }, order: [["order", "ASC"]] })
            const routeStopOrder = routeStops.find(rs => rs.placeId == placeId).order

            if (routeStopOrder !== routeStops.length - 1) {
                newTrips.push(t)

                for (let j = 0; j < routeStops.length; j++) {
                    const rs = routeStops[j];

                    t.modifiedTime = addTime(t.modifiedTime, rs.duration)

                    if (rs.order == routeStopOrder)
                        break
                }
            }
        }

        const tripArray = newTrips.map(trip => {
            const tripDate = new Date(trip.date);
            const [hours, minutes] = trip.modifiedTime.split(":");
            const pad = (num) => String(num).padStart(2, "0");

            return {
                ...trip.toJSON(),
                dateString: `${pad(tripDate.getDate())}/${pad(tripDate.getMonth() + 1)}`,
                timeString: `${hours}.${minutes}`
            };
        });

        // res.json(tripArray);
        res.render("mixins/tripRow", { trips: tripArray, tripId })
    } catch (err) {
        console.error("getDayTripsList error:", err);
        res.status(500).json({ error: "Sunucu hatası." });
    }
};

exports.getTrip = async (req, res, next) => {
    const tripDate = req.query.date
    const tripTime = req.query.time
    const place = req.query.placeId

    const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime } })

    if (trip) {
        const captain = await Captain.findOne({ where: { id: trip.captainId } })
        const route = await Route.findOne({ where: { id: trip.routeId } })
        const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
        const busModel = await BusModel.findOne({ where: { id: trip.busModelId } })

        const currentPlaceOrder = routeStops.find(rs => rs.placeId == place).order
        const routeStopOrder = routeStops.find(rs => rs.placeId == place).order

        trip.modifiedTime = trip.time

        if (routeStopOrder !== routeStops.length - 1) {
            for (let j = 0; j < routeStops.length; j++) {
                const rs = routeStops[j];

                trip.modifiedTime = addTime(trip.modifiedTime, rs.duration)

                if (rs.order == routeStopOrder)
                    break
            }
        }

        const tripDate = new Date(trip.date);
        const [hours, minutes] = trip.modifiedTime.split(":");
        const pad = (num) => String(num).padStart(2, "0");
        trip.dateString = `${pad(tripDate.getDate())}/${pad(tripDate.getMonth() + 1)}`
        trip.timeString = `${hours}.${minutes}`


        const tickets = await Ticket.findAll({ where: { tripId: trip.id, status: { [Op.notIn]: ['canceled', 'refund'] } } });
        let newTicketArray = []
        for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            const ticketPlaceOrder = routeStops.find(rs => rs.placeId == ticket.fromRouteStopId).order

            // console.log(ticketPlaceOrder)
            // console.log(currentPlaceOrder)

            if (ticketPlaceOrder == currentPlaceOrder) {
                ticket.placeOrder = "even"
            }
            else if (ticketPlaceOrder > currentPlaceOrder) {
                ticket.placeOrder = "ahead"
                ticket.createdAt = null
            }
            else if (ticketPlaceOrder < currentPlaceOrder) {
                ticket.placeOrder = "before"
            }

            ticket.from = await places.find(p => p.id == ticket.fromRouteStopId).title
            ticket.to = await places.find(p => p.id == ticket.toRouteStopId).title

            newTicketArray[ticket.seatNo] = ticket
        }
        const fromStr = places.find(p => p.id == place).title
        const toStr = places.find(p => p.id == routeStops[routeStops.length - 1].placeId).title

        res.render("mixins/busPlan", { trip, busModel, captain, route, tickets: newTicketArray, tripDate: tripDate, tripTime: tripTime, tripId: trip.id, fromId: place, toId: routeStops[routeStops.length - 1].placeId, fromStr, toStr })
    }
    else {
        res.status(404).json({ error: "Sefer bulunamadı." })
    }

}

exports.getTripTable = async (req, res, next) => {
    const tripDate = req.query.date
    const tripTime = req.query.time

    const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime } })

    let places = await Place.findAll()

    const tickets = await Ticket.findAll({ where: { tripId: trip.id, status: { [Op.in]: ["completed", "web", "reservation"] } }, order: [["seatNo", "ASC"]] })
    let newTicketArray = []
    for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        ticket.from = places.find(p => p.id == ticket.fromRouteStopId).title
        ticket.to = places.find(p => p.id == ticket.toRouteStopId).title

        newTicketArray.push(ticket)
    }

    res.render("mixins/passengersTable", { tickets: newTicketArray })
}

exports.getTripNotes = async (req, res, next) => {
    const tripId = req.query.tripId

    const notes = await TripNote.findAll({ where: { tripId: tripId } })

    res.render("mixins/tripNotes", { notes: notes })
}

exports.postTripNotes = async (req, res, next) => {
    try {
        const tripDate = req.body.date;
        const tripTime = req.body.time;
        const tripId = req.body.id;
        const noteText = req.body.text;

        const trip = await Trip.findOne({
            where: { id: tripId, date: tripDate, time: tripTime }
        });

        if (!trip) {
            return res.status(404).json({ message: "Trip not found" });
        }

        await TripNote.create({
            tripId: tripId,
            noteText: noteText
        });

        return res.status(201).json({ message: "Note created successfully" });

    } catch (error) {
        console.error("postTripNotes error:", error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};

exports.getRouteStopsTimeList = async (req, res, next) => {
    const date = req.query.date
    const time = req.query.time
    const tripId = req.query.tripId

    const trip = await Trip.findOne({ where: { id: tripId, date: date, time: time } })
    const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId } })
    const places = await Place.findAll()

    for (let i = 0; i < routeStops.length; i++) {
        const rs = routeStops[i];
        let rsTime = trip.time
        for (let j = 0; j < routeStops.length; j++) {
            const rs_ = routeStops[j];
            rsTime = addTime(rsTime, rs_.duration)
            if (rs_.order == rs.order)
                break
        }

        rs.timeStamp = rsTime.endsWith(":00") ? rsTime.slice(0, -3) : rsTime
        rs.placeStr = places.find(p => p.id == rs.placeId).title
    }

    res.render('mixins/routeStopsTimeList', { routeStops });
}

exports.getTicketOpsPopUp = async (req, res, next) => {
    const tripDate = req.query.date
    const tripTime = req.query.time
    const tripId = req.query.tripId
    const placeId = req.query.placeId

    const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime, id: tripId } })


    let routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId } })
    let places = await Place.findAll()

    const placeOrder = routeStops.find(rs => rs.placeId == placeId).order

    let newRouteStopsArray = []
    for (let i = 0; i < routeStops.length; i++) {
        const rs = routeStops[i];
        if (placeOrder < rs.order) {
            rs.title = places.find(p => p.id == rs.placeId).title

            newRouteStopsArray[rs.order] = rs
        }
    }

    console.log(newRouteStopsArray)

    res.render("mixins/ticketOpsPopUp", { routeStops: newRouteStopsArray })
}

exports.getErp = async (req, res, next) => {
    console.log(req.session.user)
    let routes = await Route.findAll()
    let busModel = await BusModel.findAll()
    let captain = await Captain.findAll()
    let firm = await Firm.findOne({ where: { id: req.session.user.firmId } })
    let branches = await Branch.findAll()
    let user = await FirmUser.findOne({ where: { id: req.session.user.id } })
    let places = await Place.findAll()
    let buses = await Bus.findAll()

    res.render('erpscreen', { title: 'ERP', busModel, buses, captain, routes, user, firm, places, branches });
}

exports.getErpLogin = async (req, res, next) => {
    res.render("erplogin")
}

exports.postErpLogin = async (req, res, next) => {
    try {
        const { username, password } = req.body;

        const u = await FirmUser.findOne({ where: { username } });
        if (!u) {
            return res.redirect("/erp/login?error=1");
        }

        const success = await bcrypt.compare(password, u.password);
        if (!success) {
            return res.redirect("/erp/login?error=1");
        }

        req.session.user = u;
        req.session.isAuthenticated = true;

        req.session.save(() => {
            const url = req.session.redirectTo || "/erp";
            delete req.session.redirectTo;

            console.log("Giriş yapan kullanıcı:", u.name);
            res.redirect(url);
        });


    } catch (err) {
        console.error(err);
        next(err);
    }
};

exports.getTripsOfDay = async (req, res, next) => {
    const date = req.query.date
    const dayTrip = await getDaysTripsFormatted(date)
    res.json(dayTrip)
}

exports.getTicketRow = async (req, res, next) => {
    const isTaken = req.query.isTaken
    if (isTaken) {
        const seatNumbers = req.query.seatNumbers
        const tripDate = req.query.date
        const tripTime = req.query.time
        const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime } })
        const ticket = await Ticket.findAll({ where: { tripId: trip.id, seatNo: { [Op.in]: seatNumbers } } })

        const seats = seatNumbers
        const gender = ticket.map(t => t.gender);

        res.render("mixins/ticketRow", { gender, seats, ticket })
    }
    else {
        const fromId = req.query.fromId
        const toId = req.query.toId
        const seats = req.query.seats
        const gender = seats.map(s => req.query.gender)
        const price = await Price.findOne({ where: { fromPlaceId: fromId, toPlaceId: toId } })

        res.render("mixins/ticketRow", { gender, seats, price: price ? price : 0 })
    }

}

exports.postTickets = async (req, res, next) => {
    try {
        const tickets = JSON.parse(req.body.tickets);
        const tripDate = req.body.tripDate;
        const tripTime = req.body.tripTime;
        const status = req.body.status;

        const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime } });

        if (!trip) {
            return res.status(404).json({ message: "Sefer bulunamadı." });
        }

        // 1. TicketGroup oluştur
        const group = await TicketGroup.create({
            tripId: trip.id,
        });

        const ticketGroupId = group.id;

        // 2. Tüm biletleri sırayla kaydet
        const pnr = await generatePNR(req.body.fromId, req.body.toId);
        for (const t of tickets) {

            const ticket = new Ticket({
                seatNo: t.seatNumber,
                gender: t.gender,
                nationality: t.nationality,
                idNumber: t.idNumber,
                name: t.name.toLocaleUpperCase("tr-TR"),
                surname: t.surname.toLocaleUpperCase("tr-TR"),
                price: t.price,
                tripId: trip.id,
                ticketGroupId: ticketGroupId,
                status: status,
                phoneNumber: t.phoneNumber,
                customerType: t.type,
                customerCategory: t.category,
                fromRouteStopId: req.body.fromId,
                toRouteStopId: req.body.toId,
                pnr: pnr,
                payment: t.payment
            });

            await ticket.save();

            // CUSTOMER KONTROLÜ (aynı TC veya aynı isim-soyisim varsa ekleme)
            const existingCustomer = await Customer.findOne({
                where: {
                    [Op.or]: [
                        { idNumber: t.idNumber },
                        {
                            name: t.name.toLocaleUpperCase("tr-TR"),
                            surname: t.surname.toLocaleUpperCase("tr-TR")
                        }
                    ]
                }
            });

            if (!existingCustomer) {
                const customer = new Customer({
                    idNumber: t.idNumber,
                    name: t.name.toLocaleUpperCase("tr-TR"),
                    surname: t.surname.toLocaleUpperCase("tr-TR"),
                    phoneNumber: t.phoneNumber,
                    gender: t.gender,
                    nationality: t.nationality,
                    customerType: t.type,
                    customerCategory: t.category
                });

                await customer.save();
            }

            if (ticket.status == "completed") {
                ticket.fromStr = (places.find(p => p.id == ticket.fromRouteStopId))?.title || "";
                ticket.toStr = (places.find(p => p.id == ticket.toRouteStopId))?.title || "";

                const transaction = new Transaction({
                    userId: req.session.user.id,
                    type: "income",
                    category: ticket.payment == "cash" ? "cash_sale" : "card_sale",
                    amount: ticket.price,
                    description: `${trip.date} ${trip.time} | ${ticket.fromStr} - ${ticket.toStr}`,
                    ticketId: ticket.id
                });

                await transaction.save();

                const register = await CashRegister.findOne({ where: { userId: req.session.user.id } });
                if (register) {
                    if (ticket.payment == "cash") {
                        register.cash_balance = register.cash_balance + ticket.price;
                    } else {
                        register.card_balance = register.card_balance + ticket.price;
                    }
                    await register.save();
                }
            }

            res.locals.newRecordId = ticket.id;
            console.log(`${t.name} Kaydedildi - ${pnr}`);
        }

        res.status(200).json({ message: "Biletler başarıyla kaydedildi." });
    } catch (err) {
        console.error("Kayıt hatası:", err);
        res.status(500).json({ message: "Kayıt sırasında bir hata oluştu." });
    }
};

exports.postEditTicket = async (req, res, next) => {
    try {
        const tickets = JSON.parse(req.body.tickets);
        const { tripDate, tripTime } = req.body;

        if (!tickets.length) {
            return res.status(400).json({ message: "Hiç bilet bilgisi gönderilmedi." });
        }

        const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime } });
        if (!trip) {
            return res.status(404).json({ message: "Sefer bulunamadı." });
        }

        const foundTickets = await Ticket.findAll({
            where: { pnr: tickets[0].pnr, tripId: trip.id },
            order: [["seatNo", "ASC"]] // sıralamayı garanti altına al
        });

        await Promise.all(foundTickets.map((foundTicket, i) => {
            foundTicket.idNumber = tickets[i].idNumber;
            foundTicket.name = tickets[i].name;
            foundTicket.surname = tickets[i].surname;
            foundTicket.phoneNumber = tickets[i].phoneNumber;
            foundTicket.gender = tickets[i].gender;
            foundTicket.nationality = tickets[i].nationality;
            foundTicket.customerType = tickets[i].type;
            foundTicket.customerCategory = tickets[i].category;
            foundTicket.price = tickets[i].price;
            return foundTicket.save();
        }));

        res.status(200).json({ message: "Biletler başarıyla kaydedildi." });
    } catch (err) {
        console.error("Kayıt hatası:", err);
        res.status(500).json({ message: "Kayıt sırasında bir hata oluştu." });
    }
};

exports.getCancelOpenTicket = async (req, res, next) => {
    const tripDate = req.query.date
    const tripTime = req.query.time
    const pnr = req.query.pnr
    const seats = req.query.seats
    const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime } })
    const foundTickets = await Ticket.findAll({ where: { pnr: pnr, seatNo: { [Op.in]: seats }, tripId: trip.id } });

    let tickets = []

    for (const e of foundTickets) {
        if (e.tripId == trip.id) {
            e.from = (await places.find(p => p.id == e.fromRouteStopId)).title;
            e.to = (await places.find(p => p.id == e.toRouteStopId)).title;
            tickets.push(e);
        }
    }

    res.render('mixins/ticketCancelRefund', { tickets: tickets, trip: trip });
}

exports.postCancelTicket = async (req, res, next) => {
    try {
        const tripDate = req.body.date
        const tripTime = req.body.time
        const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime } })
        const seats = JSON.parse(req.body.seats);
        const pnr = req.body.pnr;

        const tickets = await Ticket.findAll({ where: { pnr: pnr, seatNo: { [Op.in]: seats }, tripId: trip.id } });

        for (let i = 0; i < tickets.length; i++) {
            if (tickets[i].tripId == trip.id) {
                const currentStatus = tickets[i].status
                tickets[i].status = currentStatus === "reservation" ? "canceled" : "refund";
                await tickets[i].save();
            }
        }

        res.status(200).json({ message: "Biletler başarıyla iptal edildi." });
    } catch (err) {
        console.error("Kayıt hatası:", err);
        res.status(500).json({ message: "Kayıt sırasında bir hata oluştu." });
    }
};

exports.postOpenTicket = async (req, res, next) => {
    try {
        const tripDate = req.body.date
        const tripTime = req.body.time
        const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime } })
        const seats = JSON.parse(req.body.seats);
        const pnr = req.body.pnr;

        const tickets = await Ticket.findAll({ where: { pnr: pnr, seatNo: { [Op.in]: seats }, tripId: trip.id } });

        for (let i = 0; i < tickets.length; i++) {
            if (tickets[i].tripId == trip.id) {
                tickets[i].status = "open"
                tickets[i].tripId = null
                tickets[i].seatNo = null

                await tickets[i].save()
            }
        }

        res.status(200).json({ message: "Biletler başarıyla açığa alındı." });
    } catch (err) {
        console.error("Kayıt hatası:", err);
        res.status(500).json({ message: "Kayıt sırasında bir hata oluştu." });
    }
}

exports.getMoveTicket = async (req, res, next) => {
    const pnr = req.query.pnr
    const tripId = req.query.tripId
    const placeId = req.query.placeId

    const tickets = await Ticket.findAll({ where: { pnr, tripId }, order: [["seatNo", "ASC"]] })
    const trip = await Trip.findOne({ where: { id: tickets[0].tripId } })

    trip.modifiedTime = trip.time

    const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const routeStopOrder = routeStops.find(rs => rs.placeId == placeId).order

    if (routeStopOrder !== routeStops.length - 1) {
        for (let j = 0; j < routeStops.length; j++) {
            const rs = routeStops[j];

            trip.modifiedTime = addTime(trip.modifiedTime, rs.duration)

            if (rs.order == routeStopOrder)
                break
        }
    }

    const tripDate = new Date(trip.date);
    const [hours, minutes] = trip.modifiedTime.split(":");
    const pad = (num) => String(num).padStart(2, "0");
    trip.dateString = `${pad(tripDate.getDate())}/${pad(tripDate.getMonth() + 1)}`
    trip.timeString = `${hours}.${minutes}`

    const places = await Place.findAll()
    for (let i = 0; i < tickets.length; i++) {
        const t = tickets[i];

        t.fromPlaceString = places.find(p => p.id == t.fromRouteStopId).title
        t.toPlaceString = places.find(p => p.id == t.toRouteStopId).title
    }

    res.render("mixins/moveTicket", { trip, tickets })
};

exports.getRouteStopsListMoving = async (req, res, next) => {
    try {
        const date = req.query.date
        const time = req.query.time
        const tripId = req.query.tripId
        const placeId = req.query.placeId

        const trip = await Trip.findOne({ where: { date, time, id: tripId } })
        const places = await Place.findAll()
        const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
        const routeStopOrder = routeStops.find(rs => rs.placeId == placeId).order

        let newRouteStopsArray = []
        for (let i = 0; i < routeStops.length; i++) {
            const rs = routeStops[i];
            if (rs.order > routeStopOrder) {
                rs.setDataValue("placeStr", places.find(p => p.id == rs.placeId)?.title || "");
                newRouteStopsArray.push(rs)
                console.log(rs.placeStr)
            }
        }
        res.json(newRouteStopsArray)
    } catch (err) {
        console.error("Kayıt hatası:", err);
        res.status(500).json({ message: "Kayıt sırasında bir hata oluştu." });
    }
}

exports.postMoveTickets = async (req, res, next) => {
    try {
        const pnr = req.body.pnr
        const oldSeats = JSON.parse(req.body.oldSeats)
        const newSeats = JSON.parse(req.body.newSeats)
        const newTrip = req.body.newTrip
        const fromId = req.body.fromId
        const toId = req.body.toId

        console.log(pnr,
            oldSeats,
            newSeats,
            newTrip,
            fromId,
            toId,)

        const tickets = await Ticket.findAll({ where: { pnr: pnr, seatNo: { [Op.in]: oldSeats } } })

        for (let i = 0; i < tickets.length; i++) {
            const t = tickets[i];

            t.seatNo = newSeats[i]
            t.tripId = newTrip
            t.fromRouteStopId = fromId
            t.toRouteStopId = toId

            await t.save()
        }

        res.status(200).json({ message: "Biletler başarıyla kaydedildi." });
    } catch (err) {
        console.error("Kayıt hatası:", err);
        res.status(500).json({ message: "Kayıt sırasında bir hata oluştu." });
    }
}

exports.getSearchTable = async (req, res, next) => {
    const where = {
        ...(req.query.name && { name: req.query.name }),
        ...(req.query.surname && { surname: req.query.surname }),
        ...(req.query.idnum && { idNumber: req.query.idnum }),
        ...(req.query.phone && { phoneNumber: req.query.phone }),
        ...(req.query.pnr && { pnr: req.query.pnr })
    }

    const tickets = await Ticket.findAll({ where: where, order: [["seatNo", "ASC"]] })
    let newTicketArray = []
    for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        ticket.from = places.find(p => p.id == ticket.fromRouteStopId).title
        ticket.to = places.find(p => p.id == ticket.toRouteStopId).title

        newTicketArray.push(ticket)
    }
    res.render("mixins/passengersTable", { tickets: newTicketArray })
}

exports.getBusPlanPanel = async (req, res, next) => {
    const id = req.query.id

    console.log("----------------------------------------  " + id)

    let busModel = null

    if (id) {
        busModel = await BusModel.findOne({ where: { id: id } })

        busModel.plan = JSON.parse(busModel.plan)
    }


    res.render("mixins/busPlanPanel", { busModel: busModel })
}

exports.postSaveBusPlan = async (req, res, next) => {
    try {
        console.log("Gelen veri:", req.body);

        const data = convertEmptyFieldsToNull(req.body);

        const { id, title, description, plan, planBinary } = data;

        const [busModel, created] = await BusModel.upsert(
            {
                id,
                title,
                description,
                plan,
                planBinary
            },
            { returning: true }
        );

        if (created) {
            return res.json({ message: "Eklendi", busModel });
        } else {
            return res.json({ message: "Güncellendi", busModel });
        }
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getBusesList = async (req, res, next) => {
    const buses = await Bus.findAll()

    const busModels = await BusModel.findAll()

    for (let i = 0; i < buses.length; i++) {
        const b = buses[i];
        b.busModelStr = await busModels.find(bm => bm.id == b.busModelId).title;
    }

    res.render("mixins/busesList", { buses })
}

exports.getPricesList = async (req, res, next) => {
    const prices = await Price.findAll();
    const places = await Place.findAll();

    const placeMap = {};
    for (const pl of places) {
        placeMap[pl.id] = pl.title;
    }

    const formatted = prices.map(p => {
        const obj = p.toJSON();
        return {
            ...obj,
            fromTitle: placeMap[p.fromPlaceId] || p.fromPlaceId,
            toTitle: placeMap[p.toPlaceId] || p.toPlaceId,
            validFrom: obj.validFrom ? new Date(obj.validFrom).toLocaleDateString() : "",
            validUntil: obj.validUntil ? new Date(obj.validUntil).toLocaleDateString() : "",
            hourLimit: obj.hourLimit ? obj.hourLimit : ""
        };
    });

    res.render("mixins/pricesList", { prices: formatted, places });
}

exports.postSavePrices = async (req, res, next) => {
    try {
        const { prices } = req.body;
        if (!Array.isArray(prices)) {
            return res.status(400).json({ message: "Geçersiz veri" });
        }

        const toNullIfNotPositive = val => {
            const num = Number(val);
            return Number.isFinite(num) && num > 0 ? num : null;
        };

        for (const price of prices) {
            const {
                id,
                fromPlaceId,
                toPlaceId,
                price1,
                price2,
                price3,
                webPrice,
                singleSeatPrice1,
                singleSeatPrice2,
                singleSeatPrice3,
                singleSeatWebPrice,
                seatLimit,
                hourLimit,
                validFrom,
                validUntil
            } = price;

            await Price.update(
                {
                    fromPlaceId,
                    toPlaceId,
                    price1: toNullIfNotPositive(price1),
                    price2: toNullIfNotPositive(price2),
                    price3: toNullIfNotPositive(price3),
                    webPrice: toNullIfNotPositive(webPrice),
                    singleSeatPrice1: toNullIfNotPositive(singleSeatPrice1),
                    singleSeatPrice2: toNullIfNotPositive(singleSeatPrice2),
                    singleSeatPrice3: toNullIfNotPositive(singleSeatPrice3),
                    singleSeatWebPrice: toNullIfNotPositive(singleSeatWebPrice),
                    seatLimit: toNullIfNotPositive(seatLimit),
                    hourLimit: Number.isFinite(Number(hourLimit)) ? Number(hourLimit) : null,
                    validFrom,
                    validUntil
                },
                { where: { id } }
            );
        }

        res.json({ message: "Kaydedildi" });
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
}

exports.postAddPrice = async (req, res, next) => {
    try {
        const {
            fromPlaceId,
            toPlaceId,
            price1,
            price2,
            price3,
            webPrice,
            singleSeatPrice1,
            singleSeatPrice2,
            singleSeatPrice3,
            singleSeatWebPrice,
            seatLimit,
            hourLimit,
            validFrom,
            validUntil
        } = req.body;

        const toNullIfNotPositive = val => {
            const num = Number(val);
            return Number.isFinite(num) && num > 0 ? num : null;
        };

        await Price.create({
            fromPlaceId,
            toPlaceId,
            price1: toNullIfNotPositive(price1),
            price2: toNullIfNotPositive(price2),
            price3: toNullIfNotPositive(price3),
            webPrice: toNullIfNotPositive(webPrice),
            singleSeatPrice1: toNullIfNotPositive(singleSeatPrice1),
            singleSeatPrice2: toNullIfNotPositive(singleSeatPrice2),
            singleSeatPrice3: toNullIfNotPositive(singleSeatPrice3),
            singleSeatWebPrice: toNullIfNotPositive(singleSeatWebPrice),
            seatLimit: toNullIfNotPositive(seatLimit),
            hourLimit: Number.isFinite(Number(hourLimit)) ? Number(hourLimit) : null,
            validFrom: validFrom ? `${validFrom}T00:00` : null,
            validUntil: validUntil ? `${validUntil}T00:00` : null
        });

        res.json({ message: "Kaydedildi" });
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
}

exports.getBus = async (req, res, next) => {
    const id = req.query.id
    const licensePlate = req.query.licensePlate

    const bus = await Bus.findOne({ where: { id: id, licensePlate: licensePlate } })

    res.json(bus)
}

exports.postSaveBus = async (req, res, next) => {
    try {
        console.log("Gelen veri:", req.body);

        const data = convertEmptyFieldsToNull(req.body);

        const { id, licensePlate, busModelId, captainId, phoneNumber, owner } = data;

        const [bus, created] = await Bus.upsert(
            {
                id,
                licensePlate,
                busModelId,
                captainId,
                phoneNumber,
                owner
            },
            { returning: true }
        );

        if (created) {
            return res.json({ message: "Eklendi", bus });
        } else {
            return res.json({ message: "Güncellendi", bus });
        }
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getStopsList = async (req, res, next) => {
    const stops = await Stop.findAll();

    for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        s.placeTitle = await places.find(p => p.id == s.placeId).title;
    }

    res.render("mixins/stopsList", { stops });
};

exports.getStop = async (req, res, next) => {
    const { id } = req.query;
    const stop = await Stop.findOne({ where: { id } });
    res.json(stop);
};

exports.postSaveStop = async (req, res, next) => {
    try {
        const data = convertEmptyFieldsToNull(req.body);
        const { id, title, webTitle, placeId, UETDS_code, isServiceArea, isActive } = data;

        const [stop, created] = await Stop.upsert(
            {
                id,
                title,
                webTitle,
                placeId,
                UETDS_code,
                isServiceArea: isServiceArea === 'true' || isServiceArea === true,
                isActive: isActive === 'true' || isActive === true,
            },
            { returning: true }
        );

        if (created) {
            return res.json({ message: "Eklendi", stop });
        } else {
            return res.json({ message: "Güncellendi", stop });
        }
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getRoutesList = async (req, res, next) => {
    const routes = await Route.findAll()

    for (let i = 0; i < routes.length; i++) {
        const r = routes[i];
        r.fromTitle = await places.find(p => p.id == r.fromPlaceId).title;
        r.toTitle = await places.find(p => p.id == r.toPlaceId).title;
    }

    res.render("mixins/routesList", { routes })
}

exports.getRoute = async (req, res, next) => {
    const id = req.query.id
    const title = req.query.title

    const route = await Route.findOne({ where: { id: id, title: title } })

    res.json(route)
}

exports.getRouteStop = async (req, res, next) => {
    const { placeId, duration, isFirst } = req.query

    let routeStop = {};

    routeStop.isFirst = isFirst
    routeStop.duration = duration
    routeStop.placeId = placeId
    routeStop.place = await places.find(p => p.id == placeId).title

    res.render("mixins/routeStop", { routeStop })
}

exports.getRouteStopsList = async (req, res, next) => {
    const { id } = req.query

    const routeStops = await RouteStop.findAll({ where: { routeId: id }, order: [["order", "ASC"]] });

    for (let i = 0; i < routeStops.length; i++) {
        const routeStop = routeStops[i];
        routeStop.isFirst = routeStop.order == 0
        routeStop.place = await places.find(p => p.id == routeStop.placeId).title
    }

    res.render("mixins/routeStopsList", { routeStops })
}

exports.postSaveRoute = async (req, res, next) => {
    try {
        console.log("Gelen veri:", req.body);

        const data = convertEmptyFieldsToNull(req.body);

        const { id, routeCode, routeDescription, routeTitle, routeFrom, routeTo, routeStopsSTR } = data;

        const routeStops = JSON.parse(routeStopsSTR)

        const [route, created] = await Route.upsert(
            {
                id,
                routeCode,
                description: routeDescription,
                title: routeTitle,
                fromPlaceId: routeFrom,
                toPlaceId: routeTo,
            },
            { returning: true }
        );

        for (let i = 0; i < routeStops.length; i++) {
            const rs = routeStops[i];

            await RouteStop.create({
                routeId: route.id,
                placeId: rs.placeId,
                order: i,
                duration: rs.duration
            })
        }

        if (created) {
            return res.json({ message: "Eklendi", route });
        } else {
            return res.json({ message: "Güncellendi", route });
        }
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
}

exports.getTripsList = async (req, res, next) => {
    const date = req.query.date
    const trips = await Trip.findAll({ where: { date: date } })
    const routes = await Route.findAll()
    const bus = await Bus.findAll()

    for (let i = 0; i < trips.length; i++) {
        const t = trips[i];
        t.routeCode = await routes.find(r => r.id == t.routeId).routeCode;
        t.routeTitle = await routes.find(r => r.id == t.routeId).title;
        t.licensePlate = await bus.find(b => b.id == t.busId).licensePlate;
    }

    res.render("mixins/tripsList", { trips })
}

exports.postSaveTrip = async (req, res, next) => {
    try {
        const { routeId, firstDate, lastDate, departureTime, busModelId, busId } = req.body;

        const route = await Route.findOne({ where: { id: routeId } });
        if (!route) {
            return res.status(404).json({ error: "Hat bulunamadı" });
        }

        const start = new Date(firstDate);
        const end = new Date(lastDate);

        const diffTime = end.getTime() - start.getTime();
        let diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // gün farkı + dahil

        const fromPlace = places.find(p => p.id == route.fromPlaceId);
        const toPlace = places.find(p => p.id == route.toPlaceId);

        if (!fromPlace || !toPlace) {
            return res.status(400).json({ error: "Yer bilgisi bulunamadı" });
        }

        let trips = [];

        for (let i = 0; i < diffDays; i++) {
            const tripDate = new Date(start);
            tripDate.setDate(start.getDate() + i);

            trips.push({
                routeId: routeId,
                busModelId: busModelId,
                busId: busId,
                date: tripDate.toISOString().split("T")[0], // YYYY-MM-DD
                time: departureTime,
                fromPlaceString: fromPlace.title,
                toPlaceString: toPlace.title
            });
        }

        // topluca insert → performanslı
        await Trip.bulkCreate(trips);

        return res.status(201).json({ message: `${trips.length} sefer başarıyla eklendi` });
    } catch (err) {
        console.error("postSaveTrip error:", err);
        return res.status(500).json({ error: "Bir hata oluştu", detail: err.message });
    }
};

exports.getBranchesList = async (req, res, next) => {
    const branches = await Branch.findAll()

    for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        b.placeStr = await places.find(p => p.id == b.placeId).title;
    }

    if (req.query.onlyData) {
        res.json(branches)
    }
    else {
        res.render("mixins/branchesList", { branches })
    }
}

exports.getBranch = async (req, res, next) => {
    const id = req.query.id
    const title = req.query.title

    const branch = await Branch.findOne({ where: { id: id, title: title } })

    res.json(branch)
}

exports.postSaveBranch = async (req, res, next) => {
    try {
        console.log("Gelen veri:", req.body);

        const data = convertEmptyFieldsToNull(req.body);

        const { id, isActive, isMainBranch, title, place, mainBranch } = data;

        const [branch, created] = await Branch.upsert(
            {
                id,
                title,
                placeId: place,
                mainBranchId: mainBranch,
                isMainBranch,
                isActive,
            },
            { returning: true }
        );

        if (created) {
            return res.json({ message: "Eklendi", branch });
        } else {
            return res.json({ message: "Güncellendi", branch });
        }
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getUsersList = async (req, res, next) => {
    const users = await FirmUser.findAll()
    const branches = await Branch.findAll()

    for (let i = 0; i < users.length; i++) {
        const u = users[i];
        u.branchStr = await branches.find(b => b.id == u.branchId).title;
    }

    res.render("mixins/usersList", { users })
}

exports.getCustomersList = async (req, res, next) => {
    const { idNumber, name, surname, phone, blacklist } = req.query;
    const where = {};

    if (idNumber) where.idNumber = Number(idNumber);
    if (name) where.name = { [Op.like]: `%${name.toLocaleUpperCase("tr-TR")}%` };
    if (surname) where.surname = { [Op.like]: `%${surname.toLocaleUpperCase("tr-TR")}%` };
    if (phone) where.phoneNumber = { [Op.like]: `%${phone}%` };
    if (blacklist === 'true') where.isBlackList = true;

    const customers = await Customer.findAll({ where });
    res.render("mixins/customersList", { customers, blacklist: blacklist === 'true' });
}

exports.getMembersList = async (req, res, next) => {
    const members = await Customer.findAll({ where: { customerCategory: 'member' } })
    res.render("mixins/membersList", { members })
}

exports.postAddMember = async (req, res, next) => {
    try {
        const { idNumber, name, surname, phone } = req.body;
        const idNum = Number(idNumber);

        let customer = await Customer.findOne({ where: { idNumber: idNum } });

        if (customer) {
            customer.name = name.toLocaleUpperCase("tr-TR");
            customer.surname = surname.toLocaleUpperCase("tr-TR");
            customer.phoneNumber = phone;
            customer.customerCategory = 'member';
            await customer.save();
        } else {
            customer = await Customer.create({
                idNumber: idNum,
                name: name.toLocaleUpperCase("tr-TR"),
                surname: surname.toLocaleUpperCase("tr-TR"),
                phoneNumber: phone,
                gender: 'm',
                nationality: 'TR',
                customerType: 'adult',
                customerCategory: 'member'
            });
        }

        res.status(200).json({ success: true });
    } catch (err) {
        console.error("Member add error:", err);
        res.status(500).json({ success: false });
    }
}

exports.postCustomerBlacklist = async (req, res, next) => {
    try {
        const { id, description } = req.body;
        const customer = await Customer.findByPk(id);
        if (!customer) return res.status(404).json({ success: false });
        customer.isBlackList = true;
        customer.blackListDescription = description;
        await customer.save();
        res.status(200).json({ success: true });
    } catch (err) {
        console.error("Customer blacklist error:", err);
        res.status(500).json({ success: false });
    }
};

exports.getUser = async (req, res, next) => {
    const id = req.query.id
    const username = req.query.username

    const user = await FirmUser.findOne({ where: { id: id, username: username } })

    res.json(user)
}

exports.getUsersByBranch = async (req, res, next) => {
    const branchId = req.query.id

    const users = await FirmUser.findAll({ where: { branchId: branchId } })

    res.json(users)
}

exports.postSaveUser = async (req, res, next) => {
    try {
        console.log("Gelen veri:", req.body);

        const data = convertEmptyFieldsToNull(req.body);
        const { id, isActive, name, username, password, phone, branchId } = data;

        let hashedPassword;

        if (password) {
            // Yeni şifre varsa hashle
            hashedPassword = await bcrypt.hash(password, 12);
        } else if (id) {
            // Güncelleme ise ve şifre yoksa eski şifreyi al
            const existingUser = await FirmUser.findByPk(id);
            hashedPassword = existingUser ? existingUser.password : null;
        } else {
            // Yeni kullanıcı ekleniyor ama şifre yoksa hata döndür
            return res.status(400).json({ message: "Yeni kullanıcı için şifre zorunlu" });
        }

        const [user, created] = await FirmUser.upsert(
            {
                id,
                firmId: req.session.user.firmId,
                isActive,
                branchId,
                username,
                phoneNumber: phone,
                name,
                password: hashedPassword
            },
            { returning: true }
        );

        res.json({
            message: created ? "Eklendi" : "Güncellendi",
            user
        });

    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getTransactions = async (req, res, next) => {
    try {
        const register = await CashRegister.findOne({ where: { userId: req.session.user.id } });
        if (!register) throw new Error("Kasa kaydı bulunamadı.");

        // Tarihe göre yeni → eski
        const transactions = await Transaction.findAll({
            where: {
                userId: req.session.user.id,
                createdAt: { [Op.gt]: register.reset_date_time }
            },
            order: [["createdAt", "DESC"]]
        });

        // Ticket bilgilerini Promise.all ile ekle
        await Promise.all(transactions.map(async (t) => {
            if (t.ticketId) {
                const ticket = await Ticket.findOne({ where: { id: t.ticketId } });
                if (ticket) {
                    t.pnr = ticket.pnr;
                    t.seatNumber = ticket.seatNo;
                }
            }
        }));

        res.render("mixins/transactionsList", { transactions });
    } catch (err) {
        console.error("Get transactions error:", err);
        res.status(500).send("Bir hata oluştu.");
    }
};

exports.getTransactionData = async (req, res, next) => {
    try {
        const register = await CashRegister.findOne({ where: { userId: req.session.user.id } });
        if (!register) throw new Error("Kasa kaydı bulunamadı.");

        const transactions = await Transaction.findAll({
            where: {
                userId: req.session.user.id,
                createdAt: { [Op.gt]: register.reset_date_time }
            }
        });

        let cashSales = 0;
        let cardSales = 0;
        let cashRefund = 0;
        let cardRefund = 0;
        let transferIn = 0;
        let payedToBus = 0;
        let otherIn = 0;
        let otherOut = 0;

        for (const t of transactions) {
            const amount = Number(t.amount) || 0; // her zaman number, hata olursa 0
            switch (t.category) {
                case "cash_sale":
                    cashSales += amount;
                    break;
                case "card_sale":
                    cardSales += amount;
                    break;
                case "cash_refund":
                    cashRefund += amount;
                    break;
                case "card_refund":
                    cardRefund += amount;
                    break;
                case "payed_to_bus":
                    payedToBus += amount;
                    break;
                case "income":
                    otherIn += amount;
                    break;
                case "expense":
                    otherOut += amount;
                    break;
                case "transfer_in":
                    transferIn += amount;
                    break;
            }
        }

        res.json({
            cashSales,
            cardSales,
            cashRefund,
            cardRefund,
            transferIn,
            payedToBus,
            otherIn,
            otherOut
        });

    } catch (err) {
        console.error("Transaction data error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.postAddTransaction = async (req, res, next) => {
    try {
        const type = req.body.transactionType;
        const amount = req.body.amount;
        const description = req.body.description;

        const transaction = new Transaction({
            userId: req.session.user.id,
            type: type,
            category: type,
            amount: amount,
            description: description,
        });

        await transaction.save();
        res.locals.newRecordId = transaction.id;

        const register = await CashRegister.findOne({ where: { userId: req.session.user.id } });
        if (!register) {
            throw new Error("Kasa kaydı bulunamadı.");
        }

        register.cash_balance = Number(register.cash_balance) + Number(amount);
        await register.save();

        res.status(200).json({ success: true, transactionId: transaction.id });
    } catch (err) {
        console.error("Cash transaction error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
}

//! DEVİR İŞLEMİNDE KREDİ KARTI NEREYE GİDİYO???
// exports.postTransferRegister = async (req, res, next) => {
//     const branch = req.body.branch;
//     const user = req.body.user;

//     const registerBalance =
// }