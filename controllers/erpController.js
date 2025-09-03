var express = require('express');
var router = express.Router();
const bcrypt = require("bcrypt")
const { Op } = require('sequelize');
const BusModel = require("../models/busModelModel")
const Bus = require("../models/busModel")
const Staff = require("../models/staffModel")
const Place = require("../models/placeModel")
const Route = require("../models/routeModel")
const RouteStop = require("../models/routeStopModel");
const RouteStopRestriction = require("../models/routeStopRestrictionModel");
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
const Payment = require("../models/paymentModel")
const SystemLog = require("../models/systemLogModel")
const Price = require("../models/priceModel")
const FirmUserPermission = require("../models/firmUserPermissionModel")
const Permission = require("../models/permissionModel")

async function generatePNR(fromId, toId, stops) {
    const from = stops.find(s => s.id == fromId)?.title;
    const to = stops.find(s => s.id == toId)?.title;
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
        const stopId = req.query.stopId;
        const tripId = req.query.tripId

        if (!date) {
            return res.status(400).json({ error: "Tarih bilgisi eksik." });
        }

        // Tarih geçerli mi?
        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ error: "Geçersiz tarih formatı." });
        }

        const routeStopsByPlace = await RouteStop.findAll({ where: { stopId: stopId } })
        const routeIds = [...new Set(routeStopsByPlace.map(s => s.routeId))];

        const isPastPermission = req.session.permissions.includes("TRIP_PAST_VIEW")
        const isInactivePermission = req.session.permissions.includes("TRIP_CANCELLED_VIEW")
        const trips = await Trip.findAll({ where: { date: date, routeId: { [Op.in]: routeIds } }, order: [["time", "ASC"]] });

        var newTrips = []
        for (let i = 0; i < trips.length; i++) {
            const t = trips[i];

            t.isExpired = new Date(`${t.date} ${t.time}`) < new Date()

            if (!isPastPermission) {
                if (t.isExpired) {
                    continue
                }
            }
            if (!isInactivePermission) {
                if (!t.isActive) {
                    continue
                }
            }

            t.modifiedTime = t.time

            const routeStops = await RouteStop.findAll({ where: { routeId: t.routeId }, order: [["order", "ASC"]] })
            const routeStopOrder = routeStops.find(rs => rs.stopId == stopId).order

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
                timeString: `${hours}.${minutes}`,
                isExpired: trip.isExpired
            };
        });
        res.render("mixins/tripRow", { trips: tripArray, tripId })
    } catch (err) {
        console.error("getDayTripsList error:", err);
        res.status(500).json({ error: "Sunucu hatası." });
    }
};

exports.getTrip = async (req, res, next) => {
    const tripDate = req.query.date
    const tripTime = req.query.time
    const stopId = req.query.stopId

    const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime } })

    if (trip) {
        const captain = await Staff.findOne({ where: { id: trip.captainId, duty: "driver" } })
        const route = await Route.findOne({ where: { id: trip.routeId } })
        const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
        const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })
        const busModel = await BusModel.findOne({ where: { id: trip.busModelId } })

        const currentStopOrder = routeStops.find(rs => rs.stopId == stopId).order
        const routeStopOrder = routeStops.find(rs => rs.stopId == stopId).order

        trip.modifiedTime = trip.time
        trip.isExpired = new Date(`${trip.date} ${trip.time}`) < new Date()

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
        const users = await FirmUser.findAll({ where: { id: { [Op.in]: [...new Set(tickets.map(t => t.userId))] } } })
        const branches = await Branch.findAll({ where: { id: { [Op.in]: [...new Set(users.map(u => u.branchId))] } } })

        let newTicketArray = []
        const soldStatuses = ["completed", "web"]
        let currentSoldCount = 0
        let currentSoldAmount = 0
        let totalSoldCount = 0
        let totalSoldAmount = 0
        let currentReservedCount = 0
        let currentReservedAmount = 0
        let totalReservedCount = 0
        let totalReservedAmount = 0
        for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            const ticketPlaceOrder = routeStops.find(rs => rs.stopId == ticket.fromRouteStopId).order

            if (ticketPlaceOrder == currentStopOrder) {
                ticket.stopOrder = "even"
            }
            else if (ticketPlaceOrder > currentStopOrder) {
                ticket.stopOrder = "ahead"
                ticket.createdAt = null
            }
            else if (ticketPlaceOrder < currentStopOrder) {
                ticket.stopOrder = "before"
            }

            ticket.from = stops.find(s => s.id == ticket.fromRouteStopId).title
            ticket.to = stops.find(s => s.id == ticket.toRouteStopId).title
            ticket.user = users.find(u => u.id == ticket.userId).name
            ticket.userBranch = branches.find(b => b.id == users.find(u => u.id == ticket.userId).branchId).title
            ticket.isOwnBranch = users.find(u => u.id == ticket.userId).branchId == req.session.user.branchId


            newTicketArray[ticket.seatNo] = ticket

            if (soldStatuses.includes(ticket.status)) {
                totalSoldCount++
                totalSoldAmount += ticket.price
                if (ticket.fromRouteStopId == stopId) {
                    currentSoldCount++
                    currentSoldAmount += ticket.price
                }
            } else if (ticket.status === "reservation") {
                totalReservedCount++
                totalReservedAmount += ticket.price
                if (ticket.fromRouteStopId == stopId) {
                    currentReservedCount++
                    currentReservedAmount += ticket.price
                }
            }
        }
        const fromStr = stops.find(s => s.id == stopId).title
        const toStr = stops.find(s => s.id == routeStops[routeStops.length - 1].stopId).title
        const incomes = {
            currentSoldCount,
            currentSoldAmount,
            totalSoldCount,
            totalSoldAmount,
            currentReservedCount,
            currentReservedAmount,
            totalReservedCount,
            totalReservedAmount,
            grandCount: totalSoldCount + totalReservedCount,
            grandAmount: totalSoldAmount + totalReservedAmount
        }

        res.render("mixins/busPlan", { trip, busModel, captain, route, tickets: newTicketArray, tripDate: tripDate, tripTime: tripTime, tripId: trip.id, fromId: stopId, toId: routeStops[routeStops.length - 1].stopId, fromStr, toStr, incomes })
    }
    else {
        res.status(404).json({ error: "Sefer bulunamadı." })
    }

}

exports.getTripTable = async (req, res, next) => {
    const tripDate = req.query.date
    const tripTime = req.query.time

    const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime } })
    const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

    const tickets = await Ticket.findAll({ where: { tripId: trip.id, status: { [Op.in]: ["completed", "web", "reservation"] } }, order: [["seatNo", "ASC"]] })
    let newTicketArray = []
    for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        ticket.from = stops.find(s => s.id == ticket.fromRouteStopId).title
        ticket.to = stops.find(s => s.id == ticket.toRouteStopId).title

        newTicketArray.push(ticket)
    }

    res.render("mixins/passengersTable", { tickets: newTicketArray })
}

exports.getTripNotes = async (req, res, next) => {
    const tripId = req.query.tripId

    const notes = await TripNote.findAll({ where: { tripId: tripId, isActive: true } })

    const users = await FirmUser.findAll({ where: { id: { [Op.in]: [...new Set(notes.map(n => n.userId))] } } })

    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];

        note.user = users.find(u => u.id == note.userId)?.name

        note.isOwn = note.userId == req.session.user.id
    }

    res.render("mixins/tripNotes", { notes: notes })
}

exports.postTripNote = async (req, res, next) => {
    try {
        const tripDate = req.body.date;
        const tripTime = req.body.time;
        const tripId = req.body.tripId;
        const noteText = req.body.text;

        const trip = await Trip.findOne({
            where: { id: tripId, date: tripDate, time: tripTime }
        });

        if (!trip) {
            return res.status(404).json({ message: "Trip not found" });
        }

        await TripNote.create({
            tripId: tripId,
            noteText: noteText,
            userId: req.session.user.id
        });

        return res.status(201).json({ message: "Note created successfully" });

    } catch (error) {
        console.error("postTripNotes error:", error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};

exports.postEditTripNote = async (req, res, next) => {
    try {
        const noteId = req.body.id;
        const noteText = req.body.text;

        const note = await TripNote.findOne({ where: { id: noteId } });

        if (!note) {
            return res.status(404).json({ message: "Note not found" });
        }

        await note.update({
            noteText: noteText,
            userId: req.session.user.id
        });

        return res.status(200).json({ message: "Note updated successfully" });

    } catch (error) {
        console.error("postEditTripNote error:", error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};

exports.postDeleteTripNote = async (req, res, next) => {
    try {
        const noteId = req.body.id;

        const note = await TripNote.findOne({ where: { id: noteId } });

        if (!note) {
            return res.status(404).json({ message: "Note not found" });
        }

        await note.update({
            isActive: false
        });

        return res.status(200).json({ message: "Note deleted successfully" });

    } catch (error) {
        console.error("postDeleteTripNote error:", error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};

exports.getRouteStopsTimeList = async (req, res, next) => {
    const date = req.query.date
    const time = req.query.time
    const tripId = req.query.tripId

    const trip = await Trip.findOne({ where: { id: tripId, date: date, time: time } })
    const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

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
        rs.stopStr = stops.find(s => s.id == rs.stopId).title
    }

    res.render('mixins/routeStopsTimeList', { routeStops });
}

exports.getTripStopRestriction = async (req, res, next) => {
    try {
        const tripId = req.query.tripId;
        if (!tripId) {
            return res.status(400).json({ error: "Trip ID required" });
        }

        const trip = await Trip.findByPk(tripId);
        if (!trip) {
            return res.status(404).send("Trip not found");
        }

        const routeStops = await RouteStop.findAll({
            where: { routeId: trip.routeId },
            order: [["order", "ASC"]]
        });
        const stopIds = routeStops.map(rs => rs.stopId);
        const stops = await Stop.findAll({ where: { id: { [Op.in]: stopIds } } });
        const stopMap = new Map(stops.map(s => [s.id, s.title]));

        const rsData = routeStops.map(rs => ({
            id: rs.id,
            order: rs.order,
            title: stopMap.get(rs.stopId) || ""
        }));

        const restrictions = await RouteStopRestriction.findAll({ where: { tripId } });
        res.render("mixins/tripStopRestriction", { routeStops: rsData, restrictions });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
};

exports.postTripStopRestriction = async (req, res, next) => {
    try {
        const { tripId, fromId, toId, isAllowed } = req.body;

        const allowed = isAllowed === true || isAllowed === 'true' || isAllowed === 1 || isAllowed === '1';

        await RouteStopRestriction.upsert({
            tripId,
            fromRouteStopId: fromId,
            toRouteStopId: toId,
            isAllowed: allowed
        });

        res.json({ message: "OK" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
};

//TODO exports.getTripRevenues = async (req, res, next) => {
//TODO     try {
//TODO         const { tripId, stopId } = req.query;

//TODO         const tickets = await Ticket.findAll({
//TODO             where: {
//TODO                 tripId,
//TODO                 status: { [Op.in]: ["completed", "reservation", "web"] }
//TODO             },
//TODO             raw: true
//TODO         });

//TODO         const users = await FirmUser.findAll({ where: { id: [...new Set(tickets.map(t => t.userId))] } })

//TODO         const branches = await Branch.findAll({ where: { id: { [Op.in]: [...new Set(users.map(u => u.branchId))] } }, raw: true });

//TODO         for (let i = 0; i < tickets.length; i++) {
//TODO             const ticket = tickets[i];

//TODO         }

//TODO         const branchTitles = {};
//TODO         branches.forEach(b => branchTitles[b.id] = b.title);

//TODO         const branchData = {};
//TODO         tickets.forEach(ticket => {
//TODO             const branchId = groupBranch[ticket.ticketGroupId];
//TODO             if (!branchId) return;
//TODO             if (!branchData[branchId]) {
//TODO                 branchData[branchId] = {
//TODO                     title: branchTitles[branchId] || "",
//TODO                     currentAmount: 0,
//TODO                     totalAmount: 0
//TODO                 };
//TODO             }
//TODO             const amount = Number(ticket.price);
//TODO             branchData[branchId].totalAmount += amount;
//TODO             if (ticket.fromRouteStopId == stopId) {
//TODO                 branchData[branchId].currentAmount += amount;
//TODO             }
//TODO         });

//TODO         const branchesArr = Object.values(branchData);
//TODO         const totalCurrent = branchesArr.reduce((sum, b) => sum + b.currentAmount, 0);
//TODO         const totalAmount = branchesArr.reduce((sum, b) => sum + b.totalAmount, 0);

//TODO         res.json({ branches: branchesArr, totals: { current: totalCurrent, total: totalAmount } });
//TODO     } catch (err) {
//TODO         console.error("getTripRevenues error:", err);
//TODO         res.status(500).json({ message: "Hasılat bilgisi alınamadı." });
//TODO     }
//TODO };

exports.getTicketOpsPopUp = async (req, res, next) => {
    const tripDate = req.query.date
    const tripTime = req.query.time
    const tripId = req.query.tripId
    const stopId = req.query.stopId

    const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime, id: tripId } })


    const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })
    const currentRouteStop = routeStops.find(rs => rs.stopId == stopId)
    const placeOrder = currentRouteStop.order

    const restrictions = await RouteStopRestriction.findAll({ where: { tripId, fromRouteStopId: currentRouteStop.id } })
    const restrictionMap = new Map(restrictions.map(r => [r.toRouteStopId, r.isAllowed]))

    let newRouteStopsArray = []
    for (let i = 0; i < routeStops.length; i++) {
        const rs = routeStops[i];
        if (placeOrder < rs.order) {
            rs.title = stops.find(s => s.id == rs.stopId).title
            const allowed = restrictionMap.has(rs.id) ? restrictionMap.get(rs.id) : true
            rs.isRestricted = !allowed

            newRouteStopsArray[rs.order] = rs
        }
    }

    res.render("mixins/ticketOpsPopUp", { routeStops: newRouteStopsArray })
}

exports.getErp = async (req, res, next) => {
    let busModel = await BusModel.findAll()
    let staff = await Staff.findAll()
    let firm = await Firm.findOne({ where: { id: req.session.user.firmId } })
    let branches = await Branch.findAll()
    let user = await FirmUser.findOne({ where: { id: req.session.user.id } })
    let places = await Place.findAll()
    let stops = await Stop.findAll()

    const userPerms = await FirmUserPermission.findAll({
        where: { firmUserId: req.session.user.id, allow: true },
        attributes: ["permissionId"],
    });

    const permissionIds = userPerms.map(p => p.permissionId);
    if (permissionIds.length) {
        const permissionRows = await Permission.findAll({
            where: { id: { [Op.in]: permissionIds } },
            attributes: ["code"],
        });
        req.session.permissions = permissionRows.map(p => p.code);
    } else {
        req.session.permissions = [];
    }

    await req.session.save()

    res.render('erpscreen', { title: 'ERP', busModel, staff, user, firm, places, stops, branches });
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

        const userPerms = await FirmUserPermission.findAll({
            where: { firmUserId: u.id, allow: true },
            attributes: ["permissionId"],
        });

        const permissionIds = userPerms.map(p => p.permissionId);
        if (permissionIds.length) {
            const permissionRows = await Permission.findAll({
                where: { id: { [Op.in]: permissionIds } },
                attributes: ["code"],
            });
            req.session.permissions = permissionRows.map(p => p.code);
        } else {
            req.session.permissions = [];
        }

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

exports.getTicketRow = async (req, res, next) => {
    const isTaken = req.query.isTaken
    const tripDate = req.query.date
    const tripTime = req.query.time
    const tripId = req.query.tripId
    const stopId = req.query.stopId
    const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime, id: tripId } })

    const branch = await Branch.findOne({ where: { id: req.session.user.branchId } })
    const isOwnBranch = branch.stopId == stopId

    const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const routeStopOrder = routeStops.find(rs => rs.stopId == stopId).order

    trip.modifiedTime = trip.time
    if (routeStopOrder !== routeStops.length - 1) {
        for (let j = 0; j < routeStops.length; j++) {
            const rs = routeStops[j];

            trip.modifiedTime = addTime(trip.modifiedTime, rs.duration)

            if (rs.order == routeStopOrder)
                break
        }
    }

    if (isTaken) {
        const seatNumbers = req.query.seatNumbers
        const ticket = await Ticket.findAll({ where: { tripId: trip.id, seatNo: { [Op.in]: seatNumbers } } })

        const seats = seatNumbers
        const gender = ticket.map(t => t.gender);

        res.render("mixins/ticketRow", { gender, seats, ticket, trip, isOwnBranch })
    }
    else {
        const fromId = req.query.fromId
        const toId = req.query.toId
        const seats = req.query.seats
        const gender = seats.map(s => req.query.gender)
        const price = await Price.findOne({ where: { fromStopId: fromId, toStopId: toId } })

        res.render("mixins/ticketRow", { gender, seats, price: price ? price : 0, trip, isOwnBranch })
    }

}

exports.postTickets = async (req, res, next) => {
    try {
        const tickets = JSON.parse(req.body.tickets);
        const tripDate = req.body.tripDate;
        const tripTime = req.body.tripTime;
        const status = req.body.status;

        const trip = await Trip.findOne({ where: { date: tripDate, time: tripTime } });
        const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
        const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

        if (!trip) {
            return res.status(404).json({ message: "Sefer bulunamadı." });
        }

        // 1. TicketGroup oluştur
        const group = await TicketGroup.create({
            tripId: trip.id,
        });

        const ticketGroupId = group.id;

        // 2. Tüm biletleri sırayla kaydet
        const pnr = await generatePNR(req.body.fromId, req.body.toId, stops);
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
                optionTime: t.optionTime,
                fromRouteStopId: req.body.fromId,
                toRouteStopId: req.body.toId,
                userId: req.session.user.id,
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
                ticket.fromStr = (stops.find(s => s.id == ticket.fromRouteStopId))?.title || "";
                ticket.toStr = (stops.find(s => s.id == ticket.toRouteStopId))?.title || "";

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
    const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

    let tickets = []

    for (const e of foundTickets) {
        if (e.tripId == trip.id) {
            e.from = (stops.find(s => s.id == e.fromRouteStopId)).title;
            e.to = (stops.find(s => s.id == e.toRouteStopId)).title;
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
    const stopId = req.query.stopId

    const tickets = await Ticket.findAll({ where: { pnr, tripId }, order: [["seatNo", "ASC"]] })
    const trip = await Trip.findOne({ where: { id: tickets[0].tripId } })


    trip.modifiedTime = trip.time

    const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const routeStopOrder = routeStops.find(rs => rs.stopId == stopId).order

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

    const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })
    for (let i = 0; i < tickets.length; i++) {
        const t = tickets[i];

        t.fromPlaceString = stops.find(s => s.id == t.fromRouteStopId).title
        t.toPlaceString = stops.find(s => s.id == t.toRouteStopId).title
    }

    res.render("mixins/moveTicket", { trip, tickets })
};

exports.getRouteStopsListMoving = async (req, res, next) => {
    try {
        const date = req.query.date
        const time = req.query.time
        const tripId = req.query.tripId
        const stopId = req.query.stopId

        const trip = await Trip.findOne({ where: { date, time, id: tripId } })
        const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
        const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })
        const currentRouteStop = routeStops.find(rs => rs.stopId == stopId)
        const routeStopOrder = currentRouteStop.order

        const restrictions = await RouteStopRestriction.findAll({ where: { tripId, fromRouteStopId: currentRouteStop.id } })
        const restrictionMap = new Map(restrictions.map(r => [r.toRouteStopId, r.isAllowed]))

        let newRouteStopsArray = []
        for (let i = 0; i < routeStops.length; i++) {
            const rs = routeStops[i];
            if (rs.order > routeStopOrder) {
                rs.setDataValue("stopStr", stops.find(s => s.id == rs.stopId)?.title || "");
                const allowed = restrictionMap.has(rs.id) ? restrictionMap.get(rs.id) : true
                rs.setDataValue("isRestricted", !allowed)
                newRouteStopsArray.push(rs)
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

        const trip = await Trip.findOne({ where: { id: newTrip } })

        trip.modifiedTime = trip.time

        const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
        const routeStopOrder = routeStops.find(rs => rs.stopId == fromId).order

        if (routeStopOrder !== routeStops.length - 1) {
            for (let j = 0; j < routeStops.length; j++) {
                const rs = routeStops[j];

                trip.modifiedTime = addTime(trip.modifiedTime, rs.duration)

                if (rs.order == routeStopOrder)
                    break
            }
        }

        console.log(`${trip.date} ${trip.modifiedTime}`)

        const tickets = await Ticket.findAll({ where: { pnr: pnr, seatNo: { [Op.in]: oldSeats } } })

        for (let i = 0; i < tickets.length; i++) {
            const t = tickets[i];

            t.seatNo = newSeats[i]
            t.tripId = newTrip
            t.fromRouteStopId = fromId
            t.toRouteStopId = toId
            t.optionTime = `${trip.date} ${trip.modifiedTime}`

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
    const routeStops = await RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

    let newTicketArray = []
    for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        ticket.from = stops.find(s => s.id == ticket.fromRouteStopId).title
        ticket.to = stops.find(s => s.id == ticket.toRouteStopId).title

        newTicketArray.push(ticket)
    }
    res.render("mixins/passengersTable", { tickets: newTicketArray })
}

exports.getBusPlanPanel = async (req, res, next) => {
    let id = req.query.id
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
    const stops = await Stop.findAll();

    const stopMap = {};
    for (const s of stops) {
        stopMap[s.id] = s.title;
    }

    const formatted = prices.map(p => {
        const obj = p.toJSON();
        return {
            ...obj,
            fromTitle: stopMap[p.fromStopId] || p.fromStopId,
            toTitle: stopMap[p.toStopId] || p.toStopId,
            validFrom: obj.validFrom ? new Date(obj.validFrom).toLocaleDateString() : "",
            validUntil: obj.validUntil ? new Date(obj.validUntil).toLocaleDateString() : "",
            hourLimit: obj.hourLimit ? obj.hourLimit : ""
        };
    });

    res.render("mixins/pricesList", { prices: formatted, stops });
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
                fromStopId,
                toStopId,
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
                    fromStopId,
                    toStopId,
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
            fromStopId,
            toStopId,
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
            fromStopId,
            toStopId,
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

exports.getBusModelsData = async (req, res, next) => {
    try {
        const busModels = await BusModel.findAll();
        res.json(busModels);
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getBusesData = async (req, res, next) => {
    try {
        const buses = await Bus.findAll();
        const staffs = await Staff.findAll();

        const staffMap = {};
        for (const s of staffs) {
            staffMap[s.id] = s;
        }

        const result = buses.map(b => ({
            ...b.toJSON(),
            staff: staffMap[b.staffId] || null
        }));

        res.json(result);
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.postTripBus = async (req, res, next) => {
    try {
        const { tripId, busId } = req.body;

        const bus = await Bus.findOne({ where: { id: busId } });
        if (!bus) {
            return res.status(404).json({ message: "Otobüs bulunamadı" });
        }

        await Trip.update({
            busId: bus.id,
            busModelId: bus.busModelId,
            captainId: bus.captainId
        }, { where: { id: tripId } });

        const captain = await Captain.findOne({ where: { id: bus.captainId } });

        res.json({ message: "Güncellendi", busModelId: bus.busModelId, captain });
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.postTripBusPlan = async (req, res, next) => {
    try {
        const { tripId, busModelId } = req.body;

        await Trip.update({
            busModelId: busModelId,
            busId: null,
            captainId: null
        }, { where: { id: tripId } });

        res.json({ message: "Güncellendi" });
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.postTripStaff = async (req, res, next) => {
    try {
        const { tripId, captainId, driver2Id, driver3Id, assistantId, hostessId } = req.body;
        await Trip.update({
            captainId: captainId || null,
            driver2Id: driver2Id || null,
            driver3Id: driver3Id || null,
            assistantId: assistantId || null,
            hostessId: hostessId || null
        }, { where: { id: tripId } });
        res.json({ message: "Güncellendi" });
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.postTripActive = async (req, res, next) => {
    try {
        const { tripId, isActive } = req.body;
        await Trip.update({
            isActive: isActive === 'true' || isActive === true,
        }, { where: { id: tripId } });
        res.json({ message: "Güncellendi" });
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getStaffsList = async (req, res, next) => {
    const staff = await Staff.findAll({
        attributes: ["id", "name", "surname", "duty", "phoneNumber"],
        raw: true,
    });
    const dutyMap = { driver: 'Şoför', assistant: 'Muavin', hostess: 'Hostes' };
    staff.forEach(s => { s.dutyStr = dutyMap[s.duty] || s.duty; });

    if (req.query.onlyData) {
        res.json(staff);
    }
    else {
        res.render("mixins/staffList", { staff });
    }
};

exports.getStaff = async (req, res, next) => {
    const { id } = req.query;
    const stf = await Staff.findOne({ where: { id } });
    res.json(stf);
};

exports.postSaveStaff = async (req, res, next) => {
    try {
        const data = convertEmptyFieldsToNull(req.body);
        const { id, idNumber, duty, name, surname, address, phoneNumber, gender, nationality } = data;

        const [staff, created] = await Staff.upsert(
            { id, idNumber, duty, name, surname, address, phoneNumber, gender, nationality },
            { returning: true }
        );

        if (created) {
            return res.json({ message: "Eklendi", staff });
        } else {
            return res.json({ message: "Güncellendi", staff });
        }
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getStopsList = async (req, res, next) => {
    const stops = await Stop.findAll();
    const places = await Place.findAll()

    for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        s.placeTitle = await places.find(p => p.id == s.placeId).title;
    }

    if (req.query.onlyData) {
        res.json(stops);
    }
    else {
        res.render("mixins/stopsList", { stops });
    }
};

exports.getStop = async (req, res, next) => {
    const { id } = req.query;
    const stop = await Stop.findOne({ where: { id } });
    res.json(stop);
};

exports.getStopsData = async (req, res, next) => {
    try {
        const stops = await Stop.findAll();
        res.json(stops);
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.postSaveStop = async (req, res, next) => {
    try {
        const data = convertEmptyFieldsToNull(req.body);
        const { id, title, webTitle, placeId, UETDS_code, isServiceArea, isActive } = data;

        const [stop, created] = await Stop.upsert(
            {
                id,
                title,
                webTitle: webTitle ? webTitle : title,
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

exports.getRoutesData = async (req, res, next) => {
    try {
        const routes = await Route.findAll();
        res.json(routes);
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getRoutesList = async (req, res, next) => {
    const routes = await Route.findAll()
    const stopIds = routes.flatMap(route => [route.fromStopId, route.toStopId]);
    const stops = await Stop.findAll({ where: { id: { [Op.in]: stopIds } } });

    for (let i = 0; i < routes.length; i++) {
        const r = routes[i];
        r.fromTitle = stops.find(p => p.id == r.fromStopId).title;
        r.toTitle = stops.find(p => p.id == r.toStopId).title;
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
    const { stopId, duration, isFirst } = req.query

    let routeStop = {};

    routeStop.isFirst = isFirst
    routeStop.duration = duration
    routeStop.stopId = stopId
    const stop = await Stop.findOne({ where: { id: stopId } })
    routeStop.stop = stop.title

    res.render("mixins/routeStop", { routeStop })
}

exports.getRouteStopsList = async (req, res, next) => {
    const { id } = req.query

    const routeStops = await RouteStop.findAll({ where: { routeId: id }, order: [["order", "ASC"]] });
    const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

    for (let i = 0; i < routeStops.length; i++) {
        const routeStop = routeStops[i];
        routeStop.isFirst = routeStop.order == 0
        routeStop.stop = stops.find(s => s.id == routeStop.stopId).title
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
                fromStopId: routeFrom,
                toStopId: routeTo,
            },
            { returning: true }
        );

        for (let i = 0; i < routeStops.length; i++) {
            const rs = routeStops[i];

            await RouteStop.create({
                routeId: route.id,
                stopId: rs.stopId,
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
        t.routeCode = await routes.find(r => r.id == t.routeId)?.routeCode;
        t.routeTitle = await routes.find(r => r.id == t.routeId)?.title;
        t.licensePlate = await bus.find(b => b.id == t.busId)?.licensePlate;
    }

    res.render("mixins/tripsList", { trips })
}

exports.postSaveTrip = async (req, res, next) => {
    try {
        const { routeId, firstDate, lastDate, departureTime, busModelId, busId } = convertEmptyFieldsToNull(req.body);

        const route = await Route.findOne({ where: { id: routeId } });
        if (!route) {
            return res.status(404).json({ error: "Hat bulunamadı" });
        }

        const routeStops = await RouteStop.findAll({ where: { routeId: route.id }, order: [["order", "ASC"]] });
        const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

        const captainId = await Bus.findOne({ where: { id: busId } })?.captainId

        const start = new Date(firstDate);
        const end = new Date(lastDate);

        const diffTime = end.getTime() - start.getTime();
        let diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // gün farkı + dahil

        const fromStop = stops.find(s => s.id == route.fromStopId);
        const toStop = stops.find(s => s.id == route.toStopId);

        if (!fromStop || !toStop) {
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
                captainId: captainId,
                date: tripDate.toISOString().split("T")[0], // YYYY-MM-DD
                time: departureTime,
                fromPlaceString: fromStop.title,
                toPlaceString: toStop.title
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
    const stops = await Stop.findAll({ where: { id: { [Op.in]: [...new Set(branches.map(b => b.stopId))] } } })

    for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        b.placeStr = stops.find(s => s.id == b.stopId).title;
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

        const { id, isActive, isMainBranch, title, stop, mainBranch } = data;

        const [branch, created] = await Branch.upsert(
            {
                id,
                title,
                stopId: stop,
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
        u.branchStr = branches.find(b => b.id == u.branchId)?.title;
    }

    if (req.query.onlyData) {
        res.json(users)
    }
    else {
        res.render("mixins/usersList", { users })
    }
}

exports.getCustomersList = async (req, res, next) => {
    const { idNumber, name, surname, phone, blacklist } = req.query;
    const where = {};

    if (idNumber) where.idNumber = Number(idNumber);
    if (name) where.name = { [Op.like]: `%${name.toLocaleUpperCase("tr-TR")}%` };
    if (surname) where.surname = { [Op.like]: `%${surname.toLocaleUpperCase("tr-TR")}%` };
    if (phone) where.phoneNumber = { [Op.like]: `%${phone}%` };
    if (blacklist == 'true') where.isBlackList = true;
    else if (blacklist == 'false') where.isBlackList = false;

    const customers = await Customer.findAll({ where });
    res.render("mixins/customersList", { customers, blacklist });
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
        const userId = req.query.userId || req.session.user.id;
        const register = await CashRegister.findOne({ where: { userId } });
        if (!register) throw new Error("Kasa kaydı bulunamadı.");

        // Tarihe göre yeni → eski
        const transactions = await Transaction.findAll({
            where: {
                userId,
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
        const userId = req.query.userId || req.session.user.id;
        const register = await CashRegister.findOne({ where: { userId } });
        if (!register) throw new Error("Kasa kaydı bulunamadı.");

        const transactions = await Transaction.findAll({
            where: {
                userId,
                createdAt: { [Op.gt]: register.reset_date_time }
            }
        });

        let cashSales = 0;
        let cardSales = 0;
        let cashRefund = 0;
        let cardRefund = 0;
        let transferIn = 0;
        let transferOut = 0;
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
                case "transfer_out":
                    transferOut += amount;
                    break;
            }
        }

        res.json({
            cashSales,
            cardSales,
            cashRefund,
            cardRefund,
            transferIn,
            transferOut,
            payedToBus,
            otherIn,
            otherOut
        });

    } catch (err) {
        console.error("Transaction data error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getUserRegisterBalance = async (req, res, next) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ message: "Kullanıcı bilgisi eksik." });
        const register = await CashRegister.findOne({ where: { userId } });
        if (!register) return res.status(404).json({ message: "Kasa kaydı bulunamadı." });
        const balance = (Number(register.cash_balance) || 0) + (Number(register.card_balance) || 0);
        res.json({ balance });
    } catch (err) {
        console.error("User register balance error:", err);
        res.status(500).json({ message: err.message });
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

exports.postRequestPayment = async (req, res, next) => {
    try {
        const { userId, amount } = req.body;
        await Payment.create({
            initiatorId: req.session.user.id,
            payerId: userId,
            receiverId: req.session.user.id,
            amount
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Request payment error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.postSendPayment = async (req, res, next) => {
    try {
        const { userId, amount } = req.body;
        await Payment.create({
            initiatorId: req.session.user.id,
            payerId: req.session.user.id,
            receiverId: userId,
            amount
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Send payment error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getPendingPayments = async (req, res, next) => {
    try {
        const payments = await Payment.findAll({ where: { payerId: req.session.user.id, status: "pending" } });
        const users = await FirmUser.findAll({ where: { id: { [Op.in]: [...new Set(payments.map(p => p.receiverId))] } } });
        const result = payments.map(p => ({
            id: p.id,
            amount: p.amount,
            userName: users.find(u => u.id == p.receiverId)?.name || "",
            canConfirm: p.initiatorId !== req.session.user.id
        }));
        res.json(result);
    } catch (err) {
        console.error("Pending payments error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getPendingCollections = async (req, res, next) => {
    try {
        console.log(req.session.user.id)
        const payments = await Payment.findAll({ where: { receiverId: req.session.user.id, status: "pending" } });
        const users = await FirmUser.findAll({ where: { id: { [Op.in]: [...new Set(payments.map(p => p.payerId))] } } });
        const result = payments.map(p => ({
            id: p.id,
            amount: p.amount,
            userName: users.find(u => u.id == p.payerId)?.name || "",
            canConfirm: p.initiatorId !== req.session.user.id
        }));
        res.json(result);
    } catch (err) {
        console.error("Pending collections error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.postConfirmPayment = async (req, res, next) => {
    try {
        const { id } = req.body;
        const payment = await Payment.findOne({ where: { id } });
        const users = await FirmUser.findAll({ where: { id: { [Op.in]: [payment.payerId, payment.receiverId] } } })

        if (!payment) return res.status(404).json({ message: "Ödeme kaydı bulunamadı." });
        if (payment.status !== "pending") return res.status(400).json({ message: "Ödeme zaten işlenmiş." });
        if (payment.initiatorId === req.session.user.id) return res.status(403).json({ message: "Onay yetkiniz yok." });
        payment.status = "approved";
        await payment.save();

        await Transaction.create({
            userId: users.find(u => u.id == payment.receiverId).id,
            type: "income",
            category: "transfer_in",
            amount: Number(payment.amount),
            description: `${users.find(u => u.id == payment.payerId).name} isimli kullanıcıdan alınan ödeme.`,
        })

        await Transaction.create({
            userId: users.find(u => u.id == payment.payerId).id,
            type: "expense",
            category: "transfer_out",
            amount: Number(payment.amount),
            description: `${users.find(u => u.id == payment.receiverId).name} isimli kullanıcıya yapılan ödeme.`,
        })

        await CashRegister.findOne({ where: { userId: payment.receiverId } }).then(async cr => {
            if (cr) {
                cr.cash_balance = Number(cr.cash_balance) + Number(payment.amount);
                await cr.save();
            }
        })

        await CashRegister.findOne({ where: { userId: payment.payerId } }).then(async cr => {
            if (cr) {
                cr.cash_balance = Number(cr.cash_balance) - Number(payment.amount);
                await cr.save();
            }
        })


        res.json({ success: true });
    } catch (err) {
        console.error("Confirm payment error:", err);
        res.status(500).json({ message: err.message });
    }
};