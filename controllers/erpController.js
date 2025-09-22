var express = require('express');
var router = express.Router();
const bcrypt = require("bcrypt")
const { Op } = require('sequelize');
const { generateAccountReceiptFromDb } = require('../utilities/reports/accountCutRecipe');
const generateSalesRefundReportDetailed = require('../utilities/reports/salesRefundReportDetailed');
const generateSalesRefundReportSummary = require('../utilities/reports/salesRefundReportSummary');
const generateWebTicketsReportByBusSummary = require('../utilities/reports/webTicketsByBusSummary');
const generateWebTicketsReportByBusDetailed = require('../utilities/reports/webTicketsByBusDetailed');
const generateWebTicketsReportByStopDetailed = require('../utilities/reports/webTicketsByStopDetailed');
const generateWebTicketsReportByStopSummary = require('../utilities/reports/webTicketsByStopSummary');
const { generateDailyUserAccountReport, formatCurrency: formatDailyCurrency } = require('../utilities/reports/dailyUserAccountReport');
const generateUpcomingTicketsReport = require("../utilities/reports/upcomingTicketsReport");

async function generatePNR(models, fromId, toId, stops) {
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
        exists = await models.Ticket.findOne({ where: { pnr } }); // Sequelize'de sorgu
    }

    return pnr;
};

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

async function calculateBusAccountData(models, tripId, stopId, user) {
    const tickets = await models.Ticket.findAll({
        where: {
            tripId,
            fromRouteStopId: stopId,
            status: { [Op.in]: ["completed", "web", "gotur"] }
        },
        raw: true
    });

    const userIds = [...new Set(tickets.map(t => t.userId).filter(Boolean))];
    const users = await models.FirmUser.findAll({
        where: { id: { [Op.in]: userIds } },
        raw: true
    });
    const userBranch = {};
    users.forEach(u => userBranch[u.id] = u.branchId);

    const totalCount = tickets.length;
    let totalAmount = 0;
    let myCash = 0, myCard = 0, otherBranches = 0;

    tickets.forEach(t => {
        const amount = Number(t.price);
        totalAmount += amount;
        const branchId = userBranch[t.userId];
        if (t.userId === user.id) {
            if (t.payment === "cash") myCash += amount;
            else if (t.payment === "card") myCard += amount;
        } else if (branchId !== user.branchId) {
            otherBranches += amount;
        }
    });

    const allTotal = myCash + myCard + otherBranches;
    return { totalCount, totalAmount, myCash, myCard, otherBranches, allTotal };
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

function timeToSeconds(timeString) {
    if (!timeString || typeof timeString !== "string") {
        return 0;
    }

    const parts = timeString.split(":").map(Number);
    if (!parts.length || parts.some(isNaN)) {
        return 0;
    }

    const [hours = 0, minutes = 0, seconds = 0] = parts;
    return hours * 3600 + minutes * 60 + seconds;
}

function secondsToTime(totalSeconds) {
    const secondsInDay = 24 * 3600;
    const normalized = ((totalSeconds % secondsInDay) + secondsInDay) % secondsInDay;

    const hours = Math.floor(normalized / 3600);
    const minutes = Math.floor((normalized % 3600) / 60);
    const seconds = normalized % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTimeWithoutSeconds(timeString) {
    if (!timeString) {
        return timeString;
    }
    return timeString.endsWith(":00") ? timeString.slice(0, -3) : timeString;
}

function buildOffsetMap(offsetRows = []) {
    const map = new Map();
    offsetRows.forEach(row => {
        const routeStopId = row.routeStopId ?? row.get?.("routeStopId");
        const rawOffset = row.offsetMinutes ?? row.get?.("offsetMinutes");
        if (routeStopId === undefined || routeStopId === null) {
            return;
        }
        const offset = Number(rawOffset) || 0;
        map.set(Number(routeStopId), offset);
    });
    return map;
}

function computeRouteStopTimes(trip, routeStops = [], offsetMap = new Map()) {
    const results = [];
    let baseSeconds = timeToSeconds(trip.time);
    let cumulativeOffsetSeconds = 0;

    for (const rs of routeStops) {
        baseSeconds += timeToSeconds(rs.duration);
        const routeStopKey = Number(rs.id);
        const offsetMinutes = offsetMap.get(routeStopKey) || 0;
        cumulativeOffsetSeconds += offsetMinutes * 60;
        const adjustedSeconds = baseSeconds + cumulativeOffsetSeconds;
        results.push({
            routeStopId: routeStopKey,
            stopId: rs.stopId,
            order: rs.order,
            time: secondsToTime(adjustedSeconds),
        });
    }

    return results;
}

function parseTimeInputToMinutes(value) {
    if (!value || typeof value !== "string") {
        return null;
    }

    const parts = value.split(":").map(Number);
    if (!parts.length || parts.some(isNaN)) {
        return null;
    }

    const [hours = 0, minutes = 0, seconds = 0] = parts;
    const totalSeconds = (hours * 60 + minutes) * 60 + seconds;
    return Math.floor(totalSeconds / 60);
}

function getSeatTypes(planBinary) {
    const SEATS_PER_ROW = 5;
    const seatTypes = {};
    let seatNo = 0;

    for (let i = 0; i < planBinary.length; i++) {
        if (planBinary[i] !== '1') continue;

        seatNo++;
        const col = i % SEATS_PER_ROW;

        // A seat is double if there's another seat directly adjacent on either side
        const hasLeft = col > 0 && planBinary[i - 1] === '1';
        const hasRight = col < SEATS_PER_ROW - 1 && planBinary[i + 1] === '1';
        seatTypes[seatNo] = (hasLeft || hasRight) ? 'double' : 'single';
    }

    return seatTypes;
}

exports.getSeatTypes = getSeatTypes;

exports.test = async (req, res, next) => {
    try {
        const tripId = 13;
        await generateAccountReceiptFromDb(tripId, 1, 'bilet.pdf');
        res.send('bilet.pdf created');
    } catch (err) {
        console.error('PDF generation error:', err);
        res.status(500).json({ message: err.message });
    }
};
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

        const routeStopsByPlace = await req.models.RouteStop.findAll({ where: { stopId: stopId } })
        const routeIds = [...new Set(routeStopsByPlace.map(s => s.routeId))];

        const isPastPermission = req.session.permissions.includes("TRIP_PAST_VIEW")
        const isInactivePermission = req.session.permissions.includes("TRIP_CANCELLED_VIEW")
        const trips = await req.models.Trip.findAll({ where: { date: date, routeId: { [Op.in]: routeIds } }, order: [["time", "ASC"]] });

        const fromStop = await req.models.Stop.findOne({ where: { id: stopId } })

        const busModels = await req.models.BusModel.findAll({ where: { id: { [Op.in]: [...new Set(trips.map(t => t.busModelId))] } } })

        var newTrips = []
        for (let i = 0; i < trips.length; i++) {
            const t = trips[i];

            t.fromPlaceString = fromStop.title

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

            const ticketCount = await req.models.Ticket.count({ where: { tripId: t.id } })

            t.fullness = `${ticketCount}/${busModels.find(bm => bm.id == t.busModelId).maxPassenger}`

            const routeStops = await req.models.RouteStop.findAll({ where: { routeId: t.routeId }, order: [["order", "ASC"]] })
            const matchedRouteStop = routeStops.find(rs => rs.stopId == stopId)
            if (!matchedRouteStop) {
                continue
            }
            const routeStopOrder = matchedRouteStop.order

            if (routeStopOrder !== routeStops.length - 1) {
                const offsets = await req.models.TripStopTime.findAll({ where: { tripId: t.id }, raw: true })
                const offsetMap = buildOffsetMap(offsets)
                const stopTimes = computeRouteStopTimes(t, routeStops, offsetMap)
                const currentStopTime = stopTimes.find(st => st.order === routeStopOrder)
                if (currentStopTime) {
                    t.modifiedTime = currentStopTime.time
                }

                newTrips.push(t)
            }
        }

        const tripArray = newTrips.map(trip => {
            const tripDate = new Date(trip.date);
            const [hours, minutes] = trip.modifiedTime.split(":");
            const pad = (num) => String(num).padStart(2, "0");

            return {
                ...trip.toJSON(),
                dateString: `${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(tripDate)}`,
                timeString: `${hours}.${minutes}`,
                isExpired: trip.isExpired,
                fullness: trip.fullness
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
    const tripId = req.query.tripId
    const stopId = req.query.stopId

    const trip = await req.models.Trip.findOne({ where: { date: tripDate, time: tripTime, id: tripId } })

    if (trip) {
        const captain = await req.models.Staff.findOne({ where: { id: trip.captainId, duty: "driver" } })
        const route = await req.models.Route.findOne({ where: { id: trip.routeId } })
        const routeStops = await req.models.RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
        const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })
        const busModel = await req.models.BusModel.findOne({ where: { id: trip.busModelId } })
        const seatTypes = getSeatTypes(busModel.planBinary)
        const accountCut = await req.models.BusAccountCut.findOne({ where: { tripId: trip.id, stopId: stopId } })

        console.log(stopId)
        const currentRouteStop = routeStops.find(rs => rs.stopId == stopId)
        const currentStopOrder = currentRouteStop ? currentRouteStop.order : null

        trip.modifiedTime = trip.time
        trip.isExpired = new Date(`${trip.date} ${trip.time}`) < new Date()
        trip.isAccountCut = accountCut ? true : false

        if (currentRouteStop) {
            const offsets = await req.models.TripStopTime.findAll({ where: { tripId: trip.id }, raw: true })
            const offsetMap = buildOffsetMap(offsets)
            const stopTimes = computeRouteStopTimes(trip, routeStops, offsetMap)
            const matchedStopTime = stopTimes.find(st => st.order === currentStopOrder)
            if (matchedStopTime) {
                trip.modifiedTime = matchedStopTime.time
            }
        }

        const tripDate = new Date(trip.date);
        const [hours, minutes] = trip.modifiedTime.split(":");
        const pad = (num) => String(num).padStart(2, "0");
        trip.dateString = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(tripDate);
        trip.timeString = `${hours}.${minutes}`

        const tickets = await req.models.Ticket.findAll({ where: { tripId: trip.id, status: { [Op.notIn]: ['canceled', 'refund'] } } });
        const users = await req.models.FirmUser.findAll({ where: { id: { [Op.in]: [...new Set(tickets.map(t => t.userId))] } } })
        console.log(users)
        const branches = await req.models.Branch.findAll({ where: { id: { [Op.in]: [...new Set(users.map(u => u.branchId)), req.session.user.branchId] } } })
        console.log(branches)

        const routeStopOrderMap = routeStops.reduce((acc, rs) => {
            acc[rs.stopId] = rs.order;
            return acc;
        }, {});
        const stopsMap = stops.reduce((acc, s) => {
            acc[s.id] = s.title;
            return acc;
        }, {});
        const userMap = users.reduce((acc, u) => {
            acc[u.id] = u;
            return acc;
        }, {});
        const branchMap = branches.reduce((acc, b) => {
            acc[b.id] = b;
            return acc;
        }, {});

        trip.isOwnBranchStop = (stopId == branchMap[req.session.user.branchId].stopId).toString()

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
            const ticket = tickets[i].get({ plain: true });
            const ticketPlaceOrder = routeStopOrderMap[ticket.fromRouteStopId];

            if (ticketPlaceOrder == currentStopOrder) {
                ticket.stopOrder = "even"
            }
            else if (ticketPlaceOrder > currentStopOrder) {
                ticket.stopOrder = "ahead"
                ticket.createdAt = null
            }
            else if (ticketPlaceOrder < currentStopOrder) {
                ticket.stopOrder = "before"
                ticket.createdAt = null
            }

            const user = userMap[ticket.userId];
            const branch = branchMap[user.branchId];
            ticket.from = stopsMap[ticket.fromRouteStopId];
            ticket.to = stopsMap[ticket.toRouteStopId];
            ticket.user = user.name;
            ticket.userBranch = branch.title;
            ticket.isOwnBranchTicket = (user.branchId == req.session.user.branchId).toString();
            ticket.isOwnBranchStop = (ticket.fromRouteStopId == branchMap[req.session.user.branchId]?.stopId).toString()
            ticket.tripRefundOptionDate = trip.refundOptionDate

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

        // res.json({ trip, busModel, captain, route, tickets: newTicketArray, tripDate: tripDate, tripTime: tripTime, tripId: trip.id, fromId: stopId, toId: routeStops[routeStops.length - 1].stopId, fromStr, toStr, incomes })
        res.render("mixins/busPlan", { trip, busModel, captain, route, tickets: newTicketArray, seatTypes, tripDate: tripDate, tripTime: tripTime, tripId: trip.id, fromId: stopId, toId: routeStops[routeStops.length - 1].stopId, fromStr, toStr, incomes })
    }
    else {
        res.status(404).json({ error: "Sefer bulunamadı." })
    }

}

exports.getTripStops = async (req, res, next) => {
    try {
        const tripId = Number(req.query.tripId);
        if (!tripId) {
            return res.status(400).json({ message: "Sefer bilgisi eksik." });
        }

        const trip = await req.models.Trip.findOne({ where: { id: tripId } });
        if (!trip) {
            return res.status(404).json({ message: "Sefer bulunamadı." });
        }

        const routeStops = await req.models.RouteStop.findAll({
            where: { routeId: trip.routeId },
            order: [["order", "ASC"]]
        });

        const stopIds = [...new Set(routeStops.map(rs => rs.stopId))];
        const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: stopIds } } });
        const stopMap = new Map(stops.map(stop => [stop.id, stop.title]));

        const result = routeStops.map(rs => ({
            id: rs.stopId,
            routeStopId: rs.id,
            order: rs.order,
            title: stopMap.get(rs.stopId) || ""
        }));

        res.json(result);
    } catch (err) {
        console.error("Trip stops error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getTripTable = async (req, res, next) => {
    const tripDate = req.query.date
    const tripTime = req.query.time
    const currentStopId = req.query.stopId

    const trip = await req.models.Trip.findOne({ where: { date: tripDate, time: tripTime } })
    const routeStops = await req.models.RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

    const tickets = await req.models.Ticket.findAll({ where: { tripId: trip.id, status: { [Op.notIn]: ["pending"] } }, order: [["seatNo", "ASC"]] })
    const users = await req.models.FirmUser.findAll({ where: { id: { [Op.in]: [...new Set(tickets.map(t => t.userId))] } } })
    const branches = await req.models.Branch.findAll({ where: { id: { [Op.in]: [...new Set(users.map(u => u.branchId)), req.session.user.branchId] } } })

    const userMap = users.reduce((acc, u) => { acc[u.id] = u; return acc }, {})
    const branchMap = branches.reduce((acc, b) => { acc[b.id] = b; return acc }, {})

    const canceledStatuses = ["canceled", "refund"]
    const activeTickets = []
    const canceledTickets = []

    for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i].get({ plain: true })
        ticket.from = stops.find(s => s.id == ticket.fromRouteStopId).title
        ticket.to = stops.find(s => s.id == ticket.toRouteStopId).title
        ticket.gender = ticket.gender === "m" ? "BAY" : "BAYAN"
        ticket.isOtherStop = currentStopId && ticket.fromRouteStopId != currentStopId

        const user = userMap[ticket.userId]
        const branch = branchMap[user.branchId]
        ticket.isOwnBranchTicket = (user.branchId == req.session.user.branchId).toString()
        ticket.isOwnBranchStop = (ticket.fromRouteStopId == branchMap[req.session.user.branchId]?.stopId).toString()
        ticket.tripRefundOptionDate = trip.refundOptionDate

        if (canceledStatuses.includes(ticket.status)) {
            canceledTickets.push(ticket)
        } else {
            activeTickets.push(ticket)
        }
    }

    res.render("mixins/passengersTable", { activeTickets, canceledTickets })
}

exports.getTripNotes = async (req, res, next) => {
    const tripId = req.query.tripId

    const notes = await req.models.TripNote.findAll({ where: { tripId: tripId, isActive: true } })

    const users = await req.models.FirmUser.findAll({ where: { id: { [Op.in]: [...new Set(notes.map(n => n.userId))] } } })

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

        const trip = await req.models.Trip.findOne({
            where: { id: tripId, date: tripDate, time: tripTime }
        });

        if (!trip) {
            return res.status(404).json({ message: "Trip not found" });
        }

        await req.models.TripNote.create({
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

exports.getBusAccountCutData = async (req, res, next) => {
    try {
        const BUS_COMISSION_PERCENT = 20

        const { tripId, stopId } = req.query;
        const data = await calculateBusAccountData(req.models, tripId, stopId, req.session.user);
        const comissionAmount = data.allTotal * BUS_COMISSION_PERCENT / 100;
        const needToPay = data.allTotal - comissionAmount;
        res.json({
            ...data,
            comissionPercent: BUS_COMISSION_PERCENT,
            comissionAmount,
            needToPay
        });
    } catch (err) {
        console.error("getBusAccountCutData error:", err);
        res.status(500).json({ message: "Hesap bilgisi alınamadı." });
    }
};

exports.postBusAccountCut = async (req, res, next) => {
    try {
        const { tripId, stopId } = req.body;
        const parse = v => Number(v) || 0;
        const BUS_COMISSION_PERCENT = parse(req.body.comissionPercent);
        const d1 = parse(req.body.deduction1);
        const d2 = parse(req.body.deduction2);
        const d3 = parse(req.body.deduction3);
        const d4 = parse(req.body.deduction4);
        const d5 = parse(req.body.deduction5);
        const tip = parse(req.body.tip);
        const payedAmount = parse(req.body.payedAmount);
        const description = req.body.description || "";

        const trip = await req.models.Trip.findOne({ where: { id: tripId } })
        const bus = await req.models.Bus.findOne({ where: { id: trip.busId } })
        const routeStops = await req.models.RouteStop.findAll({ where: { routeId: trip.routeId } })
        const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

        const data = await calculateBusAccountData(req.models, tripId, stopId, req.session.user);
        const comissionAmount = data.allTotal * BUS_COMISSION_PERCENT / 100;
        const needToPay = data.allTotal - comissionAmount - d1 - d2 - d3 - d4 - d5 - tip;

        await req.models.BusAccountCut.create({
            tripId,
            stopId,
            comissionPercent: BUS_COMISSION_PERCENT,
            comissionAmount,
            deduction1: d1,
            deduction2: d2,
            deduction3: d3,
            deduction4: d4,
            deduction5: d5,
            tip,
            description,
            needToPayAmount: needToPay,
            payedAmount
        });

        await req.models.Transaction.create({
            userId: req.session.user.id,
            type: "expense",
            category: "payed_to_bus",
            amount: payedAmount,
            description: `${bus ? bus.licensePlate + " | " : ""}${trip.date} ${trip.time} | ${stops.find(s => s.id == stopId).title} - ${stops.find(s => s.id == routeStops[routeStops.length - 1].stopId).title}`
        });

        const register = await req.models.CashRegister.findOne({ where: { userId: req.session.user.id } });
        if (register) {
            register.cash_balance = (register.cash_balance || 0) - (payedAmount || 0);
            await register.save();
        }

        res.json({ message: "OK" });
    } catch (err) {
        console.error("postBusAccountCut error:", err);
        res.status(500).json({ message: "Hesap kesilemedi." });
    }
};

exports.getBusAccountCutRecord = async (req, res, next) => {
    try {
        const { tripId, stopId } = req.query;
        const record = await req.models.BusAccountCut.findOne({ where: { tripId, stopId } });
        if (!record) return res.status(404).json({ message: "Hesap bulunamadı." });
        const data = await calculateBusAccountData(req.models, tripId, stopId, req.session.user);
        res.json({
            id: record.id,
            myCash: data.myCash,
            myCard: data.myCard,
            otherBranches: data.otherBranches,
            allTotal: data.allTotal,
            comissionPercent: record.comissionPercent,
            comissionAmount: record.comissionAmount,
            deduction1: record.deduction1,
            deduction2: record.deduction2,
            deduction3: record.deduction3,
            deduction4: record.deduction4,
            deduction5: record.deduction5,
            tip: record.tip,
            description: record.description,
            needToPay: record.needToPayAmount,
            payedAmount: record.payedAmount
        });
    } catch (err) {
        console.error("getBusAccountCutRecord error:", err);
        res.status(500).json({ message: "Hesap bilgisi alınamadı." });
    }
};

exports.postDeleteBusAccountCut = async (req, res, next) => {
    try {
        const { id } = req.body;
        const accountCut = await req.models.BusAccountCut.findOne({ where: { id } });

        const trip = await req.models.Trip.findOne({ where: { id: accountCut.tripId } })
        const bus = await req.models.Bus.findOne({ where: { id: trip.busId } })
        const routeStops = await req.models.RouteStop.findAll({ where: { routeId: trip.routeId } })
        const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

        await req.models.Transaction.create({
            userId: req.session.user.id,
            type: "income",
            category: "payed_to_bus",
            amount: accountCut.payedAmount,
            description: `Hesap kesimi geri alındı | ${bus ? bus.licensePlate + " | " : ""}${trip.date} ${trip.time} | ${stops.find(s => s.id == accountCut.stopId).title} - ${stops.find(s => s.id == routeStops[routeStops.length - 1].stopId).title}`
        });

        const register = await req.models.CashRegister.findOne({ where: { userId: req.session.user.id } });
        if (register) {
            register.cash_balance = (register.cash_balance || 0) + (accountCut.payedAmount || 0);
            await register.save();
        }

        res.json({ message: "OK" });
    } catch (err) {
        console.error("postDeleteBusAccountCut error:", err);
        res.status(500).json({ message: "Hesap geri alınamadı." });
    }
};

exports.getBusAccountCutReceipt = async (req, res, next) => {
    try {
        const { tripId, stopId } = req.query;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="account_receipt.pdf"');
        await generateAccountReceiptFromDb(tripId, stopId, res);
    } catch (err) {
        console.error("getBusAccountCutReceipt error:", err);
        res.status(500).json({ message: "Hesap fişi oluşturulamadı." });
    }
};

exports.postEditTripNote = async (req, res, next) => {
    try {
        const noteId = req.body.id;
        const noteText = req.body.text;

        const note = await req.models.TripNote.findOne({ where: { id: noteId } });

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

        const note = await req.models.TripNote.findOne({ where: { id: noteId } });

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

    const trip = await req.models.Trip.findOne({ where: { id: tripId, date: date, time: time } })
    const routeStops = await req.models.RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

    const offsets = await req.models.TripStopTime.findAll({ where: { tripId: trip.id }, raw: true })
    const offsetMap = buildOffsetMap(offsets)
    const stopTimes = computeRouteStopTimes(trip, routeStops, offsetMap)
    const timeMap = new Map(stopTimes.map(st => [st.routeStopId, st.time]))

    for (let i = 0; i < routeStops.length; i++) {
        const rs = routeStops[i];
        const timeStr = timeMap.get(rs.id) || trip.time
        rs.timeStamp = formatTimeWithoutSeconds(timeStr)
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

        const trip = await req.models.Trip.findByPk(tripId);
        if (!trip) {
            return res.status(404).send("Trip not found");
        }

        const routeStops = await req.models.RouteStop.findAll({
            where: { routeId: trip.routeId },
            order: [["order", "ASC"]]
        });
        const stopIds = routeStops.map(rs => rs.stopId);
        const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: stopIds } } });
        const stopMap = new Map(stops.map(s => [s.id, s.title]));

        const rsData = routeStops.map(rs => ({
            id: rs.id,
            order: rs.order,
            title: stopMap.get(rs.stopId) || ""
        }));

        const restrictions = await req.models.RouteStopRestriction.findAll({ where: { tripId } });
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

        const restiction = await req.models.RouteStopRestriction.findOne({
            where: { tripId, fromRouteStopId: fromId, toRouteStopId: toId }
        });

        if (restiction) {
            await restiction.update({ isAllowed: allowed });
        } else {
            await req.models.RouteStopRestriction.create({
                tripId,
                fromRouteStopId: fromId,
                toRouteStopId: toId,
                isAllowed: allowed
            });
        }

        res.json({ message: "OK" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
};

exports.postTripTimeAdjustment = async (req, res, next) => {
    try {
        const { tripId, routeStopId, direction, amount } = req.body;

        const numericTripId = Number(tripId);
        const numericRouteStopId = Number(routeStopId);

        if (!numericTripId || !numericRouteStopId) {
            return res.status(400).json({ message: "Geçersiz sefer veya durak bilgisi." });
        }

        const normalizedDirection = direction === "backward" ? "backward" : direction === "forward" ? "forward" : null;
        if (!normalizedDirection) {
            return res.status(400).json({ message: "Geçerli bir yön seçiniz." });
        }

        const minutes = parseTimeInputToMinutes(amount);
        if (minutes === null) {
            return res.status(400).json({ message: "Geçerli bir süre giriniz." });
        }
        if (minutes === 0) {
            return res.status(400).json({ message: "Süre 0 olamaz." });
        }

        const hasPermission = (req.session.permissions || []).includes("TRIP_TIME_ADJUST") ||
            (req.session.permissions || []).includes("TRIP_STOP_RESTRICT");

        if (!hasPermission) {
            return res.status(403).json({ message: "Bu işlem için yetkiniz yok." });
        }

        const trip = await req.models.Trip.findByPk(numericTripId);
        if (!trip) {
            return res.status(404).json({ message: "Sefer bulunamadı." });
        }

        const routeStop = await req.models.RouteStop.findOne({ where: { id: numericRouteStopId, routeId: trip.routeId } });
        if (!routeStop) {
            return res.status(404).json({ message: "Sefer durağı bulunamadı." });
        }

        const delta = minutes * (normalizedDirection === "backward" ? -1 : 1);

        const [record, created] = await req.models.TripStopTime.findOrCreate({
            where: { tripId: numericTripId, routeStopId: numericRouteStopId },
            defaults: { offsetMinutes: delta }
        });

        if (!created) {
            const current = Number(record.offsetMinutes) || 0;
            const updated = current + delta;
            if (updated === 0) {
                await record.destroy();
            } else {
                record.offsetMinutes = updated;
                await record.save();
            }
        }

        const offsets = await req.models.TripStopTime.findAll({ where: { tripId: numericTripId }, raw: true });
        const offsetMap = buildOffsetMap(offsets);
        const routeStops = await req.models.RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] });
        const stopTimes = computeRouteStopTimes(trip, routeStops, offsetMap).map(st => ({
            routeStopId: st.routeStopId,
            order: st.order,
            time: formatTimeWithoutSeconds(st.time)
        }));

        res.json({ success: true, stopTimes });
    } catch (err) {
        console.error("postTripTimeAdjustment error:", err);
        res.status(500).json({ message: err.message || "Sefer saati güncellenemedi." });
    }
};

exports.getTripRevenues = async (req, res, next) => {
    try {
        const { tripId, stopId } = req.query;

        const tickets = await req.models.Ticket.findAll({
            where: {
                tripId,
                status: { [Op.in]: ["completed", "reservation", "web"] }
            },
            raw: true
        });

        const userIds = [...new Set(tickets.map(t => t.userId).filter(id => id))];
        const users = await req.models.FirmUser.findAll({ where: { id: userIds }, raw: true });
        const branchIds = [...new Set(users.map(u => u.branchId).filter(id => id))];
        const branches = await req.models.Branch.findAll({ where: { id: { [Op.in]: branchIds } }, raw: true });

        const userBranch = {};
        users.forEach(u => userBranch[u.id] = u.branchId);

        const branchTitles = {};
        branches.forEach(b => branchTitles[b.id] = b.title);

        const branchData = {};
        tickets.forEach(ticket => {
            const branchId = userBranch[ticket.userId];
            if (!branchId) return;

            if (!branchData[branchId]) {
                branchData[branchId] = {
                    title: branchTitles[branchId] || "",
                    currentAmount: 0,
                    currentCount: 0,
                    totalAmount: 0,
                    totalCount: 0
                };
            }

            const amount = Number(ticket.price);
            branchData[branchId].totalAmount += amount;
            branchData[branchId].totalCount += 1;

            if (ticket.fromRouteStopId == stopId) {
                branchData[branchId].currentAmount += amount;
                branchData[branchId].currentCount += 1;
            }
        });

        const branchesArr = Object.values(branchData);
        const totals = branchesArr.reduce((acc, b) => {
            acc.currentAmount += b.currentAmount;
            acc.currentCount += b.currentCount;
            acc.totalAmount += b.totalAmount;
            acc.totalCount += b.totalCount;
            return acc;
        }, { currentAmount: 0, currentCount: 0, totalAmount: 0, totalCount: 0 });

        res.json({ branches: branchesArr, totals });
    } catch (err) {
        console.error("getTripRevenues error:", err);
        res.status(500).json({ message: "Hasılat bilgisi alınamadı." });
    }
};

exports.postAddCargo = async (req, res, next) => {
    try {
        const tripId = Number(req.body.tripId);
        const fromStopId = Number(req.body.fromStopId);
        const toStopId = Number(req.body.toStopId);
        const senderName = (req.body.senderName || "").trim();
        const senderPhone = (req.body.senderPhone || "").trim();
        const senderIdentity = (req.body.senderIdentity || "").trim();
        const description = (req.body.description || "").trim();
        const payment = req.body.payment;
        const price = Number(req.body.price);

        if (!tripId) {
            return res.status(400).json({ message: "Sefer bilgisi eksik." });
        }
        if (!fromStopId || !toStopId) {
            return res.status(400).json({ message: "Durak bilgisi eksik." });
        }
        if (!senderName) {
            return res.status(400).json({ message: "Gönderen adı gereklidir." });
        }
        if (!senderPhone) {
            return res.status(400).json({ message: "Gönderen telefon bilgisi gereklidir." });
        }
        if (!senderIdentity) {
            return res.status(400).json({ message: "Gönderen TC bilgisi gereklidir." });
        }
        if (!payment || !["cash", "card"].includes(payment)) {
            return res.status(400).json({ message: "Geçersiz ödeme tipi." });
        }
        if (!price || Number.isNaN(price) || price <= 0) {
            return res.status(400).json({ message: "Geçerli bir ücret giriniz." });
        }

        const trip = await req.models.Trip.findOne({ where: { id: tripId } });
        if (!trip) {
            return res.status(404).json({ message: "Sefer bulunamadı." });
        }

        const cargo = await req.models.Cargo.create({
            userId: req.session.user.id,
            tripId,
            fromStopId,
            toStopId,
            senderName,
            senderPhone,
            senderIdentity,
            description,
            payment,
            price
        });

        const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [fromStopId, toStopId] } } });
        const fromStop = stops.find(s => s.id == fromStopId);
        const toStop = stops.find(s => s.id == toStopId);

        await req.models.Transaction.create({
            userId: req.session.user.id,
            type: "income",
            category: payment === "cash" ? "cash_sale" : "card_sale",
            amount: price,
            description: `Kargo | ${trip.date} ${trip.time} | ${(fromStop ? fromStop.title : "")} - ${(toStop ? toStop.title : "")}`
        });

        const register = await req.models.CashRegister.findOne({ where: { userId: req.session.user.id } });
        if (register) {
            if (payment === "cash") {
                register.cash_balance = Number(register.cash_balance) + price;
            } else {
                register.card_balance = Number(register.card_balance) + price;
            }
            await register.save();
        }

        res.json({ success: true, cargoId: cargo.id });
    } catch (err) {
        console.error("Cargo add error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.postRefundCargo = async (req, res, next) => {
    try {
        const cargoId = Number(req.body.cargoId);

        if (!cargoId) {
            return res.status(400).json({ message: "Geçersiz kargo bilgisi." });
        }

        if (!req.session.user || !req.session.user.id) {
            return res.status(401).json({ message: "Oturum bilgisi bulunamadı." });
        }

        const cargo = await req.models.Cargo.findOne({ where: { id: cargoId } });
        if (!cargo) {
            return res.status(404).json({ message: "Kargo kaydı bulunamadı." });
        }

        const amountNum = Number.parseFloat(cargo.price);
        const amount = Number.isNaN(amountNum) ? 0 : amountNum;

        let tripInfo = "";
        let routeInfo = "";

        if (cargo.tripId) {
            const trip = await req.models.Trip.findOne({ where: { id: cargo.tripId }, raw: true });
            if (trip) {
                const tripParts = [trip.date || "", trip.time || ""].map(part => (part || "").toString().trim()).filter(Boolean);
                if (tripParts.length) {
                    tripInfo = tripParts.join(" ");
                }
            }
        }

        const stopIds = [cargo.fromStopId, cargo.toStopId]
            .map(id => (id === undefined || id === null) ? null : Number(id))
            .filter(id => id !== null && !Number.isNaN(id));

        const uniqueStopIds = [...new Set(stopIds)];

        if (uniqueStopIds.length) {
            const stops = await req.models.Stop.findAll({
                where: { id: { [Op.in]: uniqueStopIds } },
                raw: true
            });

            const fromTitle = stops.find(s => Number(s.id) === Number(cargo.fromStopId))?.title || "";
            const toTitle = stops.find(s => Number(s.id) === Number(cargo.toStopId))?.title || "";
            const routeParts = [fromTitle, toTitle].map(part => (part || "").toString().trim()).filter(Boolean);
            if (routeParts.length) {
                routeInfo = routeParts.join(" - ");
            }
        }

        const descriptionParts = ["Kargo iade edildi"];
        if (tripInfo) descriptionParts.push(tripInfo);
        if (routeInfo) descriptionParts.push(routeInfo);
        const description = descriptionParts.join(" | ");

        await req.models.Transaction.create({
            userId: req.session.user.id,
            type: "expense",
            category: cargo.payment === "card" ? "card_refund" : "cash_refund",
            amount: amount,
            description
        });

        const register = await req.models.CashRegister.findOne({ where: { userId: req.session.user.id } });
        if (register && amount > 0) {
            if (cargo.payment === "cash") {
                register.cash_balance = Number(register.cash_balance) - amount;
            } else if (cargo.payment === "card") {
                register.card_balance = Number(register.card_balance) - amount;
            }
            await register.save();
        }

        await cargo.destroy();

        res.json({ success: true });
    } catch (err) {
        console.error("Cargo refund error:", err);
        res.status(500).json({ success: false, message: "Kargo iadesi sırasında bir hata oluştu." });
    }
};

exports.getTripCargoList = async (req, res, next) => {
    try {
        const tripId = Number(req.query.tripId);

        if (!tripId) {
            return res.status(400).json({ message: "Sefer bilgisi eksik." });
        }

        const cargos = await req.models.Cargo.findAll({
            where: { tripId },
            order: [["createdAt", "DESC"]],
            raw: true
        });

        if (!cargos.length) {
            return res.render("mixins/tripCargoList", { cargos: [] });
        }

        const stopIdSet = new Set();
        cargos.forEach(cargo => {
            const fromId = Number(cargo.fromStopId);
            if (!Number.isNaN(fromId)) {
                stopIdSet.add(fromId);
            }
            const toId = Number(cargo.toStopId);
            if (!Number.isNaN(toId)) {
                stopIdSet.add(toId);
            }
        });

        const stopMap = {};
        const stopIds = Array.from(stopIdSet);
        if (stopIds.length) {
            const stops = await req.models.Stop.findAll({
                where: { id: { [Op.in]: stopIds } },
                raw: true
            });

            stops.forEach(stop => {
                stopMap[String(stop.id)] = stop.title;
            });
        }

        const formatAmount = amount => {
            const num = Number(amount);
            if (Number.isNaN(num)) {
                return amount ? String(amount) : "";
            }
            return num.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        const formatted = cargos.map(cargo => {
            const priceNum = Number(cargo.price);
            const priceValue = Number.isNaN(priceNum) ? cargo.price : priceNum;

            const fromKey = cargo.fromStopId !== undefined && cargo.fromStopId !== null
                ? String(cargo.fromStopId)
                : "";
            const toKey = cargo.toStopId !== undefined && cargo.toStopId !== null
                ? String(cargo.toStopId)
                : "";

            return {
                ...cargo,
                description: cargo.description || "",
                senderName: cargo.senderName || "",
                senderPhone: cargo.senderPhone || "",
                fromTitle: fromKey ? (stopMap[fromKey] || "") : "",
                toTitle: toKey ? (stopMap[toKey] || "") : "",
                price: priceValue,
                priceFormatted: formatAmount(cargo.price),
                paymentLabel: cargo.payment === "card" ? "Kart" : "Nakit"
            };
        });

        res.render("mixins/tripCargoList", { cargos: formatted });
    } catch (err) {
        console.error("getTripCargoList error:", err);
        res.status(500).json({ message: "Kargo listesi alınamadı." });
    }
};

exports.getTicketOpsPopUp = async (req, res, next) => {
    const tripDate = req.query.date
    const tripTime = req.query.time
    const tripId = req.query.tripId
    const stopId = req.query.stopId

    const trip = await req.models.Trip.findOne({ where: { date: tripDate, time: tripTime, id: tripId } })
    const branch = await req.models.Branch.findOne({ where: { id: req.session.user.branchId } })

    const isOwnBranchStop = (stopId == branch.stopId).toString()

    const routeStops = await req.models.RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })
    const currentRouteStop = routeStops.find(rs => rs.stopId == stopId)
    const placeOrder = currentRouteStop.order

    const restrictions = await req.models.RouteStopRestriction.findAll({ where: { tripId, fromRouteStopId: currentRouteStop.id } })
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

    res.render("mixins/ticketOpsPopUp", { routeStops: newRouteStopsArray, isOwnBranchStop, reservationOptionDate: trip.reservationOptionDate })
}

exports.getErp = async (req, res, next) => {
    let busModel = await req.models.BusModel.findAll()
    let staff = await req.models.Staff.findAll()
    let branches = await req.models.Branch.findAll()
    let user = await req.models.FirmUser.findOne({ where: { id: req.session.user.id } })
    let places = await req.commonModels.Place.findAll()
    let stops = await req.models.Stop.findAll()

    const userPerms = await req.models.FirmUserPermission.findAll({
        where: { firmUserId: req.session.user.id, allow: true },
        attributes: ["permissionId"],
    });

    const permissionIds = userPerms.map(p => p.permissionId);
    if (permissionIds.length) {
        const permissionRows = await req.models.Permission.findAll({
            where: { id: { [Op.in]: permissionIds } },
            attributes: ["code"],
        });
        req.session.permissions = permissionRows.map(p => p.code);
    } else {
        req.session.permissions = [];
    }

    await req.session.save()

    res.render('erpscreen', { title: 'ERP', busModel, staff, user, places, stops, branches });
}

exports.getErpLogin = async (req, res, next) => {
    res.render("erplogin", { isNoNavbar: true })
}

exports.postErpLogin = async (req, res, next) => {
    try {
        const { username, password } = req.body;

        const u = await req.models.FirmUser.findOne({ where: { username } });
        if (!u) {
            return res.redirect("/login?error=1");
        }

        const success = await bcrypt.compare(password, u.password);
        if (!success) {
            return res.redirect("/login?error=1");
        }

        req.session.user = u;
        req.session.isAuthenticated = true;

        const userPerms = await req.models.FirmUserPermission.findAll({
            where: { firmUserId: u.id, allow: true },
            attributes: ["permissionId"],
        });

        const permissionIds = userPerms.map(p => p.permissionId);
        if (permissionIds.length) {
            const permissionRows = await req.models.Permission.findAll({
                where: { id: { [Op.in]: permissionIds } },
                attributes: ["code"],
            });
            req.session.permissions = permissionRows.map(p => p.code);
        } else {
            req.session.permissions = [];
        }

        req.session.save(() => {
            const url = "/";

            console.log("Giriş yapan kullanıcı:", u.name);
            res.redirect(url);
        });


    } catch (err) {
        console.error(err);
        next(err);
    }
};

exports.postErpLogout = (req, res, next) => {
    if (!req.session) {
        return res.redirect("/login");
    }

    req.session.destroy((err) => {
        if (err) {
            console.error("Oturum kapatma sırasında hata oluştu:", err);
            return next(err);
        }

        res.clearCookie("connect.sid");
        res.redirect("/login");
    });
};

exports.getPermissions = (req, res) => res.json(req.session.permissions || []);

exports.getTicketRow = async (req, res, next) => {
    const { isOpen, isTaken, date: tripDate, time: tripTime, tripId, stopId, seatTypes, action } = req.query;

    // Trip için where koşulunu dinamik kur
    const tripWhere = {};
    if (tripDate) tripWhere.date = tripDate;
    if (tripTime) tripWhere.time = tripTime;
    if (tripId) tripWhere.id = tripId;

    const trip = await req.models.Trip.findOne({ where: tripWhere });
    if (!trip) return res.status(404).json({ message: "Sefer bulunamadı" });

    const branch = await req.models.Branch.findOne({ where: { id: req.session.user.branchId } });
    const isOwnBranch = stopId ? branch.stopId == stopId : false;

    const routeStops = await req.models.RouteStop.findAll({
        where: { routeId: trip.routeId },
        order: [["order", "ASC"]],
    });

    const routeStopOrder = stopId
        ? routeStops.find((rs) => String(rs.stopId) === String(stopId))?.order
        : null;

    trip.modifiedTime = trip.time;
    if (routeStopOrder !== null) {
        const offsets = await req.models.TripStopTime.findAll({ where: { tripId: trip.id }, raw: true });
        const offsetMap = buildOffsetMap(offsets);
        const stopTimes = computeRouteStopTimes(trip, routeStops, offsetMap);
        const matchedStopTime = stopTimes.find(st => st.order === routeStopOrder);
        if (matchedStopTime) {
            trip.modifiedTime = matchedStopTime.time;
        }
    }

    // --- OPEN CASE ---
    if (isOpen) {
        const { fromId, toId, count } = req.query;
        let price = 0;
        if (fromId && toId) {
            const p = await req.models.Price.findOne({ where: { fromStopId: fromId, toStopId: toId } });
            price = p ? p : 0;
        }

        let seats = []
        let gender = []
        for (let i = 0; i < count; i++) {
            seats.push(0)
            gender.push("m")
        }
        return res.render("mixins/ticketRow", { gender, seats, price, trip, isOwnBranch, seatTypes, action });
    }

    // --- TAKEN CASE ---
    if (isTaken) {
        const { seatNumbers } = req.query;
        const ticket = seatNumbers
            ? await req.models.Ticket.findAll({ where: { tripId: trip.id, seatNo: { [Op.in]: seatNumbers }, fromRouteStopId: stopId, status: { [Op.notIn]: ["cancelled", "refund"] } } })
            : [];

        if (!ticket.length) {
            return res.status(404).json({ message: "Bilet bulunamadı" });
        }

        const user = await req.models.FirmUser.findOne({ where: { id: ticket[0].userId } });
        const ticketUserBranch = user ? await req.models.Branch.findOne({ where: { id: user.branchId } }) : null;

        const gender = ticket.map((t) => t.gender);
        return res.render("mixins/ticketRow", { gender, seats: seatNumbers, ticket, trip, isOwnBranch, seatTypes, action });
    }

    // --- ELSE CASE ---
    const { fromId, toId, seats, gender: genderParam } = req.query;
    const gender = seats ? seats.map((s) => genderParam) : [];
    let price = 0;
    if (fromId && toId) {
        const p = await req.models.Price.findOne({ where: { fromStopId: fromId, toStopId: toId } });
        price = p ? p : 0;
    }

    const group = await req.models.TicketGroup.create({ tripId: trip.id });
    const ticketGroupId = group.id;

    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    const nowDate = now.toISOString().split("T")[0];
    const nowTime = now.toTimeString().split(" ")[0];

    let pendingIds = []

    for (let i = 0; i < seats.length; i++) {
        const seatNumber = seats[i];

        const ticket = await req.models.Ticket.create({
            seatNo: seatNumber,
            gender: gender[i],
            nationality: "tr",
            tripId: trip.id,
            ticketGroupId: ticketGroupId,
            status: "pending",
            optionTime: nowTime,
            optionDate: nowDate,
            fromRouteStopId: fromId,
            toRouteStopId: toId,
            userId: req.session.user.id,
        });

        await ticket.save()

        pendingIds.push(ticket.id)
    }

    return res.render("mixins/ticketRow", { gender, seats, price, trip, isOwnBranch, seatTypes, action, pendingIds });
};

exports.postTickets = async (req, res, next) => {
    try {
        const tickets = Array.isArray(req.body.tickets)
            ? req.body.tickets
            : JSON.parse(req.body.tickets || "[]");

        const tripDate = req.body.tripDate;
        const tripTime = req.body.tripTime;
        const tripId = req.body.tripId;
        const status = req.body.status;
        const fromId = req.body.fromId;
        const toId = req.body.toId;

        // --- req.models.Trip.where'i dinamik kur ---
        const tripWhere = {};
        if (tripDate) tripWhere.date = tripDate;
        if (tripTime) tripWhere.time = tripTime;
        if (tripId) tripWhere.id = tripId;

        if (Object.keys(tripWhere).length === 0) {
            return res.status(400).json({ message: "Geçersiz sefer parametreleri." });
        }

        const trip = await req.models.Trip.findOne({ where: tripWhere });
        if (!trip) {
            return res.status(404).json({ message: "Sefer bulunamadı." });
        }

        // --- RouteStops ve Stops (boş dizi korumalı) ---
        const routeStops = await req.models.RouteStop.findAll({
            where: { routeId: trip.routeId },
            order: [["order", "ASC"]],
        });

        const stopIds = [...new Set(routeStops.map(rs => rs?.stopId).filter(Boolean))];
        let stops = [];
        if (stopIds.length) {
            stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: stopIds } } });
        }

        // --- TicketGroup ---
        const group = await req.models.TicketGroup.create({ tripId: trip.id });
        const ticketGroupId = group.id;

        // --- PNR (sadece fromId & toId varsa) ---
        const pnr = (fromId && toId) ? await generatePNR(req.models, fromId, toId, stops) : null;

        const pendingIds = Array.isArray(req.body.pendingIds) ? req.body.pendingIds : JSON.parse(req.body.pendingIds);
        console.log(pendingIds)
        console.log(req.body.pendingIds)
        // --- Tüm biletleri sırayla kaydet ---
        for (let i = 0; i < tickets.length; i++) {
            const t = tickets[i]
            if (!t) continue;

            console.log({ id: pendingIds[i], tripId: trip.id, seatNo: t.seatNumber, userId: req.session.user.id })
            const pendingTicket = await req.models.Ticket.findOne({ where: { id: pendingIds[i], tripId: trip.id, seatNo: t.seatNumber, userId: req.session.user.id } })
            const pendingTicketGroup = await req.models.TicketGroup.findOne({ where: { id: pendingTicket.ticketGroupId } })
            await pendingTicket?.destroy().then(r => console.log("pending silindi"))
            await pendingTicketGroup?.destroy().then(r => console.log("pending grup silindi"))

            const ticket = await req.models.Ticket.create({
                seatNo: t.seatNumber,
                gender: t.gender,
                nationality: t.nationality,
                idNumber: t.idNumber,
                name: (t.name || "").toLocaleUpperCase("tr-TR"),
                surname: (t.surname || "").toLocaleUpperCase("tr-TR"),
                price: t.price ? t.price : null,
                tripId: trip.id,
                ticketGroupId: ticketGroupId,
                status: status,
                phoneNumber: t.phoneNumber,
                customerType: t.type,
                customerCategory: t.category,
                optionTime: t.optionTime,
                optionDate: t.optionDate,
                fromRouteStopId: fromId,
                toRouteStopId: toId,
                userId: req.session.user.id,
                pnr: pnr,
                payment: t.payment
            });

            // CUSTOMER KONTROLÜ (boş alanları sorguya koyma)
            const nameUp = (t.name || "").toLocaleUpperCase("tr-TR");
            const surnameUp = (t.surname || "").toLocaleUpperCase("tr-TR");

            const orConds = [];
            if (t.idNumber) orConds.push({ idNumber: t.idNumber });
            if (nameUp && surnameUp) orConds.push({ name: nameUp, surname: surnameUp });

            let existingCustomer = null;
            if (orConds.length) {
                existingCustomer = await req.models.Customer.findOne({ where: { [Op.or]: orConds } });
            }

            if (!existingCustomer) {
                await req.models.Customer.create({
                    idNumber: t.idNumber || null,
                    name: nameUp || null,
                    surname: surnameUp || null,
                    phoneNumber: t.phoneNumber || null,
                    gender: t.gender || null,
                    nationality: t.nationality || null,
                    customerType: t.type || null,
                    customerCategory: t.category || null
                });
            }
            else {
                ticket.customerId = existingCustomer.id
                if (existingCustomer.customerCategory == "member" && existingCustomer.pointOrPercent == "point") {
                    if (ticket.payment === "point") {
                        existingCustomer.point_amount = Number(existingCustomer.point_amount) - Number(ticket.price)
                    } else {
                        existingCustomer.point_amount = Number(existingCustomer.point_amount) + Number(ticket.price) * 0.05
                    }
                }
                await ticket.save()
                await existingCustomer.save()
            }

            if (ticket.status === "completed" && ticket.payment !== "point") {
                const fromTitle = (stops.find(s => s.id == ticket.fromRouteStopId))?.title || "";
                const toTitle = (stops.find(s => s.id == ticket.toRouteStopId))?.title || "";

                await req.models.Transaction.create({
                    userId: req.session.user.id,
                    type: "income",
                    category: ticket.payment === "cash" ? "cash_sale" : ticket.payment === "card" ? "card_sale" : "point_sale",
                    amount: ticket.price,
                    description: `${trip.date} ${trip.time} | ${fromTitle} - ${toTitle}`,
                    ticketId: ticket.id
                });

                const register = await req.models.CashRegister.findOne({ where: { userId: req.session.user.id } });
                if (register) {
                    if (ticket.payment === "cash") {
                        register.cash_balance = Number(register.cash_balance) + (Number(ticket.price) || 0);
                    } else if (ticket.payment === "card") {
                        register.card_balance = Number(register.card_balance) + (Number(ticket.price) || 0);
                    }
                    await register.save();
                }
            }

            res.locals.newRecordId = ticket.id;
            console.log(`${t.name} Kaydedildi - ${pnr || "-"}`);
        }

        return res.status(200).json({ message: "Biletler başarıyla kaydedildi." });
    } catch (err) {
        console.error("Kayıt hatası:", err);
        return res.status(500).json({ message: "Kayıt sırasında bir hata oluştu." });
    }
};

exports.postCompleteTickets = async (req, res, next) => {
    try {
        const tickets = Array.isArray(req.body.tickets)
            ? req.body.tickets
            : JSON.parse(req.body.tickets || "[]");

        const tripDate = req.body.tripDate;
        const tripTime = req.body.tripTime;
        const tripId = req.body.tripId;
        const status = req.body.status;
        const fromId = req.body.fromId;
        const toId = req.body.toId;

        const pnr = tickets[0].pnr
        const seatNumbers = tickets.map(t => t.seatNumber)

        // --- req.models.Trip.where'i dinamik kur ---
        const tripWhere = {};
        if (tripDate) tripWhere.date = tripDate;
        if (tripTime) tripWhere.time = tripTime;
        if (tripId) tripWhere.id = tripId;

        if (Object.keys(tripWhere).length === 0) {
            return res.status(400).json({ message: "Geçersiz sefer parametreleri." });
        }

        const trip = await req.models.Trip.findOne({ where: tripWhere });
        if (!trip) {
            return res.status(404).json({ message: "Sefer bulunamadı." });
        }

        // --- RouteStops ve Stops (boş dizi korumalı) ---
        const routeStops = await req.models.RouteStop.findAll({
            where: { routeId: trip.routeId },
            order: [["order", "ASC"]],
        });

        const stopIds = [...new Set(routeStops.map(rs => rs?.stopId).filter(Boolean))];
        let stops = [];
        if (stopIds.length) {
            stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: stopIds } } });
        }

        const foundTickets = await req.models.Ticket.findAll({ where: { tripId: trip.id, pnr: pnr, seatNo: { [Op.in]: seatNumbers } } })

        for (let i = 0; i < foundTickets.length; i++) {
            const ticket = foundTickets[i];
            ticket.userId = req.session.user.id
            ticket.idNumber = tickets[i].idNumber
            ticket.name = tickets[i].name
            ticket.surname = tickets[i].surname
            ticket.phoneNumber = tickets[i].phoneNumber
            ticket.gender = tickets[i].gender
            ticket.nationality = tickets[i].nationality
            ticket.type = tickets[i].type
            ticket.category = tickets[i].category
            ticket.optionTime = tickets[i].optionTime
            ticket.price = tickets[i].price
            ticket.payment = tickets[i].payment
            ticket.status = "completed"
            ticket.createdAt = new Date()


            // CUSTOMER KONTROLÜ (boş alanları sorguya koyma)
            const nameUp = (ticket.name || "").toLocaleUpperCase("tr-TR");
            const surnameUp = (ticket.surname || "").toLocaleUpperCase("tr-TR");

            const orConds = [];
            if (ticket.idNumber) orConds.push({ idNumber: ticket.idNumber });
            if (nameUp && surnameUp) orConds.push({ name: nameUp, surname: surnameUp });

            let existingCustomer = null;
            if (orConds.length) {
                existingCustomer = await req.models.Customer.findOne({ where: { [Op.or]: orConds } });
            }

            if (!existingCustomer) {
                const customer = await req.models.Customer.create({
                    idNumber: ticket.idNumber || null,
                    name: nameUp || null,
                    surname: surnameUp || null,
                    phoneNumber: ticket.phoneNumber || null,
                    gender: ticket.gender || null,
                    nationality: ticket.nationality || null,
                    customerType: ticket.type || null,
                    customerCategory: ticket.category || null
                });
                ticket.customerId = customer.id
            }

            await ticket.save()

            const fromTitle = (stops.find(s => s.id == ticket.fromRouteStopId))?.title || "";
            const toTitle = (stops.find(s => s.id == ticket.toRouteStopId))?.title || "";

            await req.models.Transaction.create({
                userId: req.session.user.id,
                type: "income",
                category: ticket.payment === "cash" ? "cash_sale" : ticket.payment === "card" ? "card_sale" : "point_sale",
                amount: ticket.price,
                description: `${trip.date} ${trip.time} | ${fromTitle} - ${toTitle}`,
                ticketId: ticket.id
            });

            const register = await req.models.CashRegister.findOne({ where: { userId: req.session.user.id } });
            if (register) {
                if (ticket.payment === "cash") {
                    register.cash_balance = Number(register.cash_balance) + (Number(ticket.price) || 0);
                } else if (ticket.payment === "card") {
                    register.card_balance = Number(register.card_balance) + (Number(ticket.price) || 0);
                }
                await register.save();
            }

            res.locals.newRecordId = ticket.id;
            console.log(`${ticket.name} Kaydedildi - ${pnr || "-"}`);
        }
        return res.status(200).json({ message: "Biletler başarıyla kaydedildi." });
    } catch (err) {
        console.error("Kayıt hatası:", err);
        return res.status(500).json({ message: "Kayıt sırasında bir hata oluştu." });
    }
};

exports.postSellOpenTickets = async (req, res, next) => {
    try {
        const tickets = JSON.parse(req.body.tickets)

        const status = req.body.status;
        const fromId = req.body.fromId;
        const toId = req.body.toId;

        const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [fromId, toId] } } });

        // --- TicketGroup ---
        const group = await req.models.TicketGroup.create({ tripId: null });
        const ticketGroupId = group.id;

        console.log(req.body.tickets)
        console.log(tickets)
        // --- PNR ---
        const pnr = (fromId && toId) ? await generatePNR(req.models, fromId, toId, stops) : null;

        for (const t of tickets) {
            const ticket = await req.models.Ticket.create({
                seatNo: 0,
                gender: t.gender,
                nationality: t.nationality,
                idNumber: t.idNumber,
                name: (t.name || "").toLocaleUpperCase("tr-TR"),
                surname: (t.surname || "").toLocaleUpperCase("tr-TR"),
                price: t.price ?? 0,
                tripId: null,
                ticketGroupId: ticketGroupId,
                status: status,
                phoneNumber: t.phoneNumber,
                customerType: t.type,
                customerCategory: t.category,
                optionTime: t.optionTime,
                fromRouteStopId: fromId,
                toRouteStopId: toId,
                userId: req.session.user.id,
                pnr: pnr,
                payment: t.payment
            });

            // CUSTOMER KONTROLÜ (boş alanları sorguya koyma)
            const nameUp = (t.name || "").toLocaleUpperCase("tr-TR");
            const surnameUp = (t.surname || "").toLocaleUpperCase("tr-TR");

            const orConds = [];
            if (t.idNumber) orConds.push({ idNumber: t.idNumber });
            if (nameUp && surnameUp) orConds.push({ name: nameUp, surname: surnameUp });

            let existingCustomer = null;
            if (orConds.length) {
                existingCustomer = await req.models.Customer.findOne({ where: { [Op.or]: orConds } });
            }

            if (!existingCustomer) {
                await req.models.Customer.create({
                    idNumber: t.idNumber || null,
                    name: nameUp || null,
                    surname: surnameUp || null,
                    phoneNumber: t.phoneNumber || null,
                    gender: t.gender || null,
                    nationality: t.nationality || null,
                    customerType: t.type || null,
                    customerCategory: t.category || null
                });
            }


            const fromTitle = (stops.find(s => s.id == ticket.fromRouteStopId))?.title || "";
            const toTitle = (stops.find(s => s.id == ticket.toRouteStopId))?.title || "";

            await req.models.Transaction.create({
                userId: req.session.user.id,
                type: "income",
                category: ticket.payment === "cash" ? "cash_sale" : ticket.payment === "card" ? "card_sale" : "point_sale",
                amount: ticket.price,
                description: `Açık bilet satıldı | ${fromTitle} - ${toTitle}`,
                ticketId: ticket.id
            });

            const register = await req.models.CashRegister.findOne({ where: { userId: req.session.user.id } });
            if (register) {
                if (ticket.payment === "cash") {
                    register.cash_balance = Number(register.cash_balance) + (Number(ticket.price) || 0);
                } else if (ticket.payment === "card") {
                    register.card_balance = Number(register.card_balance) + (Number(ticket.price) || 0);
                }
                await register.save();
            }
            res.locals.newRecordId = ticket.id;
            console.log(`${t.name} Kaydedildi - ${pnr || "-"}`);
        }
    } catch (err) {
        console.error("Kayıt hatası:", err);
        res.status(500).json({ message: "Kayıt sırasında bir hata oluştu." });
    }
}

exports.postEditTicket = async (req, res, next) => {
    try {
        const tickets = JSON.parse(req.body.tickets);
        const { tripDate, tripTime } = req.body;

        if (!tickets.length) {
            return res.status(400).json({ message: "Hiç bilet bilgisi gönderilmedi." });
        }

        const trip = await req.models.Trip.findOne({ where: { date: tripDate, time: tripTime } });
        if (!trip) {
            return res.status(404).json({ message: "Sefer bulunamadı." });
        }

        const foundTickets = await req.models.Ticket.findAll({
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
    const trip = await req.models.Trip.findOne({ where: { date: tripDate, time: tripTime } })
    const foundTickets = await req.models.Ticket.findAll({ where: { pnr: pnr, seatNo: { [Op.in]: seats }, tripId: trip.id } });
    const routeStops = await req.models.RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

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
        const trip = await req.models.Trip.findOne({ where: { date: tripDate, time: tripTime } })
        const seats = JSON.parse(req.body.seats);
        const pnr = req.body.pnr;

        const tickets = await req.models.Ticket.findAll({ where: { pnr: pnr, seatNo: { [Op.in]: seats }, tripId: trip.id } });
        const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(tickets.map(t => t.fromRouteStopId)), ...new Set(tickets.map(t => t.toRouteStopId))] } } })

        for (let i = 0; i < tickets.length; i++) {
            if (tickets[i].tripId == trip.id) {
                const ticket = tickets[i]
                const currentStatus = ticket.status
                ticket.status = currentStatus === "reservation" ? "canceled" : "refund";
                await ticket.save();

                if (ticket.status == "refund" && ticket.payment !== "point") {
                    const fromTitle = (stops.find(s => s.id == ticket.fromRouteStopId))?.title || "";
                    const toTitle = (stops.find(s => s.id == ticket.toRouteStopId))?.title || "";

                    await req.models.Transaction.create({
                        userId: req.session.user.id,
                        type: "expense",
                        category: ticket.payment === "cash" ? "cash_refund" : ticket.payment === "card" ? "card_refund" : "point_refund",
                        amount: ticket.price,
                        description: `Bilet iade edildi | ${fromTitle} - ${toTitle}`,
                        ticketId: ticket.id
                    });

                    const register = await req.models.CashRegister.findOne({ where: { userId: req.session.user.id } });
                    if (register) {
                        if (ticket.payment === "cash") {
                            register.cash_balance = Number(register.cash_balance) - (Number(ticket.price) || 0);
                        } else if (ticket.payment === "card") {
                            register.card_balance = Number(register.card_balance) - (Number(ticket.price) || 0);
                        }
                        await register.save();
                    }
                }
                else if (ticket.status == "refund" && ticket.payment == "point") {
                    const nameUp = (ticket.name || "").toLocaleUpperCase("tr-TR");
                    const surnameUp = (ticket.surname || "").toLocaleUpperCase("tr-TR");

                    const orConds = [];
                    if (ticket.idNumber) orConds.push({ idNumber: ticket.idNumber });
                    if (nameUp && surnameUp) orConds.push({ name: nameUp, surname: surnameUp });

                    let existingCustomer = null;
                    if (orConds.length) {
                        existingCustomer = await req.models.Customer.findOne({ where: { [Op.or]: orConds } });
                    }

                    if (existingCustomer.customerCategory == "member" && existingCustomer.pointOrPercent == "point") {
                        existingCustomer.point_amount = Number(existingCustomer.point_amount) + Number(ticket.price)
                    }
                    await existingCustomer.save()
                }
                res.locals.newRecordId = ticket.id;
            }
        }

        res.status(200).json({ message: "Biletler başarıyla iptal edildi." });
    } catch (err) {
        console.error("Kayıt hatası:", err);
        res.status(500).json({ message: "Kayıt sırasında bir hata oluştu." });
    }
};

exports.postDeletePendingTickets = async (req, res, next) => {
    try {
        const { date, time, tripId } = req.body;
        const seats = JSON.parse(req.body.seats);
        const pendingIds = JSON.parse(req.body.pendingIds);

        console.log(pendingIds)

        const trip = await req.models.Trip.findOne({
            where: {
                date,
                time,
                id: tripId
            }
        })

        const deleted = await req.models.Ticket.destroy({
            where: {
                tripId: trip.id,
                seatNo: { [Op.in]: seats },
                id: { [Op.in]: pendingIds }
            }
        });

        if (deleted === 0) {
            return res.status(404).json({ message: "Silinecek uygun kayıt bulunamadı" });
        }

        return res.status(200).json({
            message: "Bekleyen bilet(ler) başarıyla silindi",
            deleted
        });
    } catch (err) {
        console.error("postDeletePendingTickets error:", err);
        return res.status(500).json({ message: "Sunucu hatası" });
    }
};

exports.postOpenTicket = async (req, res, next) => {
    try {
        const tripDate = req.body.date
        const tripTime = req.body.time
        const trip = await req.models.Trip.findOne({ where: { date: tripDate, time: tripTime } })
        const seats = JSON.parse(req.body.seats);
        const pnr = req.body.pnr;

        const tickets = await req.models.Ticket.findAll({ where: { pnr: pnr, seatNo: { [Op.in]: seats }, tripId: trip.id } });

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

    const tickets = await req.models.Ticket.findAll({ where: { pnr, tripId }, order: [["seatNo", "ASC"]] })
    const trip = await req.models.Trip.findOne({ where: { id: tickets[0].tripId } })


    trip.modifiedTime = trip.time

    const routeStops = await req.models.RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const currentRouteStop = routeStops.find(rs => rs.stopId == stopId)
    const routeStopOrder = currentRouteStop ? currentRouteStop.order : null

    if (currentRouteStop) {
        const offsets = await req.models.TripStopTime.findAll({ where: { tripId: trip.id }, raw: true })
        const offsetMap = buildOffsetMap(offsets)
        const stopTimes = computeRouteStopTimes(trip, routeStops, offsetMap)
        const matchedStopTime = stopTimes.find(st => st.order === routeStopOrder)
        if (matchedStopTime) {
            trip.modifiedTime = matchedStopTime.time
        }
    }

    const tripDate = new Date(trip.date);
    const [hours, minutes] = trip.modifiedTime.split(":");
    const pad = (num) => String(num).padStart(2, "0");
    trip.dateString = `${pad(tripDate.getDate())}/${pad(tripDate.getMonth() + 1)}`
    trip.timeString = `${hours}.${minutes}`

    const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })
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

        const trip = await req.models.Trip.findOne({ where: { date, time, id: tripId } })
        const routeStops = await req.models.RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
        const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })
        const currentRouteStop = routeStops.find(rs => rs.stopId == stopId)
        const routeStopOrder = currentRouteStop.order

        const restrictions = await req.models.RouteStopRestriction.findAll({ where: { tripId, fromRouteStopId: currentRouteStop.id } })
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

    const trip = await req.models.Trip.findOne({ where: { id: newTrip } })

    trip.modifiedTime = trip.time

    const routeStops = await req.models.RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] })
    const currentRouteStop = routeStops.find(rs => rs.stopId == fromId)
    const routeStopOrder = currentRouteStop ? currentRouteStop.order : null

    if (currentRouteStop) {
        const offsets = await req.models.TripStopTime.findAll({ where: { tripId: trip.id }, raw: true })
        const offsetMap = buildOffsetMap(offsets)
        const stopTimes = computeRouteStopTimes(trip, routeStops, offsetMap)
        const matchedStopTime = stopTimes.find(st => st.order === routeStopOrder)
        if (matchedStopTime) {
            trip.modifiedTime = matchedStopTime.time
        }
    }

        console.log(`${trip.date} ${trip.modifiedTime}`)

        const tickets = await req.models.Ticket.findAll({ where: { pnr: pnr, seatNo: { [Op.in]: oldSeats } } })

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
    try {
        // Query'leri trimleyip boş olanları ele
        const filters = {
            ...(req.query.name?.trim() && { name: req.query.name.trim() }),
            ...(req.query.surname?.trim() && { surname: req.query.surname.trim() }),
            ...(req.query.idnum?.trim() && { idNumber: req.query.idnum.trim() }),
            ...(req.query.phone?.trim() && { phoneNumber: req.query.phone.trim() }),
            ...(req.query.pnr?.trim() && { pnr: req.query.pnr.trim() }),
            ...(req.query.status?.trim() && { status: req.query.status.trim() }),
        };

        // Filtre yoksa where göndermeyelim
        const where = Object.keys(filters).length ? filters : undefined;

        const tickets = await req.models.Ticket.findAll({
            ...(where && { where }),
            order: [["seatNo", "ASC"]],
        });

        // Hiç bilet yoksa direkt boş tablo render et
        if (!tickets.length) {
            return res.render("mixins/searchPassengersTable", { activeTickets: [], canceledTickets: [] });
        }

        // İlişkili verileri sadece ihtiyaç varsa topla
        const tripIds = [...new Set(tickets.map((t) => t.tripId).filter(Boolean))];

        let stopMap = new Map(); // stopId -> stopTitle
        let tripMap = new Map(); // tripId -> { date, time }

        if (tripIds.length) {
            const trips = await req.models.Trip.findAll({
                where: { id: { [Op.in]: tripIds } },
            });

            tripMap = new Map(trips.map((tr) => [String(tr.id), { date: tr.date, time: tr.time }]));

            const routeIds = [
                ...new Set(trips.map((tr) => tr.routeId).filter(Boolean)),
            ];

            if (routeIds.length) {
                const routeStops = await req.models.RouteStop.findAll({
                    where: { routeId: { [Op.in]: routeIds } },
                    order: [["order", "ASC"]],
                });

                const stopIds = [
                    ...new Set(routeStops.map((rs) => rs.stopId).filter(Boolean)),
                ];

                if (stopIds.length) {
                    const stops = await req.models.Stop.findAll({
                        where: { id: { [Op.in]: stopIds } },
                    });

                    // Hızlı erişim için map'e çevir
                    stopMap = new Map(stops.map((s) => [String(s.id), s.title]));
                }
            }
        }

        // Ticket'ları from/to başlıklarıyla zenginleştir
        const newTicketArray = tickets.map((ticket) => {
            const t = ticket.toJSON ? ticket.toJSON() : ticket; // Sequelize instance -> plain obj
            const fromTitle = stopMap.get(String(t.fromRouteStopId)) || "-";
            const toTitle = stopMap.get(String(t.toRouteStopId)) || "-";
            const tripInfo = tripMap.get(String(t.tripId)) || {};
            const tripDate = tripInfo.date || t.optionDate || "";
            const tripTime = tripInfo.time || "";

            return {
                ...t,
                from: fromTitle,
                to: toTitle,
                gender: t.gender === "m" ? "BAY" : "BAYAN",
                date: tripDate,
                time: tripTime,
            };
        });

        const canceledStatuses = ["canceled", "refund"];
        const activeTickets = newTicketArray.filter(t => !canceledStatuses.includes(t.status));
        const canceledTickets = newTicketArray.filter(t => canceledStatuses.includes(t.status));

        return res.render("mixins/searchPassengersTable", { activeTickets, canceledTickets });
    } catch (err) {
        return next(err);
    }
};


exports.getBusPlanPanel = async (req, res, next) => {
    let id = req.query.id
    let busModel = null

    if (id) {
        busModel = await req.models.BusModel.findOne({ where: { id: id } })

        busModel.plan = JSON.parse(busModel.plan)
    }


    res.render("mixins/busPlanPanel", { busModel: busModel })
}

exports.postSaveBusPlan = async (req, res, next) => {
    try {
        console.log("Gelen veri:", req.body);

        const data = convertEmptyFieldsToNull(req.body);

        const { id, title, description, plan, planBinary, maxPassenger
        } = data;
        console.log(maxPassenger)
        const [busModel, created] = await req.models.BusModel.upsert(
            {
                id,
                title,
                description,
                plan,
                planBinary,
                maxPassenger
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

exports.postDeleteBusPlan = async (req, res, next) => {
    try {
        const id = Number(req.body.id);
        if (!id) {
            return res.status(400).json({ message: "Geçersiz plan bilgisi" });
        }

        const deleted = await req.models.BusModel.destroy({ where: { id } });
        if (!deleted) {
            return res.status(404).json({ message: "Otobüs planı bulunamadı" });
        }

        res.json({ message: "Silindi" });
    } catch (err) {
        console.error("Bus plan delete error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getBusesList = async (req, res, next) => {
    const buses = await req.models.Bus.findAll()

    const busModels = await req.models.BusModel.findAll()

    for (let i = 0; i < buses.length; i++) {
        const b = buses[i];
        b.busModelStr = await busModels.find(bm => bm.id == b.busModelId).title;
    }

    res.render("mixins/busesList", { buses })
}

exports.getPricesList = async (req, res, next) => {
    const prices = await req.models.Price.findAll();
    const stops = await req.models.Stop.findAll();

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

            await req.models.Price.update(
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

        await req.models.Price.create({
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

exports.postDeletePrice = async (req, res, next) => {
    try {
        const id = Number(req.body.id);
        if (!id) {
            return res.status(400).json({ message: "Geçersiz fiyat bilgisi" });
        }

        const deleted = await req.models.Price.destroy({ where: { id } });
        if (!deleted) {
            return res.status(404).json({ message: "Fiyat bulunamadı" });
        }

        res.json({ message: "Silindi" });
    } catch (err) {
        console.error("Price delete error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getBus = async (req, res, next) => {
    const id = req.query.id
    const licensePlate = req.query.licensePlate

    const bus = await req.models.Bus.findOne({ where: { id: id, licensePlate: licensePlate } })

    res.json(bus)
}

exports.postSaveBus = async (req, res, next) => {
    try {
        console.log("Gelen veri:", req.body);

        const data = convertEmptyFieldsToNull(req.body);

        const { id, licensePlate, busModelId, captainId, phoneNumber, owner } = data;

        const [bus, created] = await req.models.Bus.upsert(
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

exports.postDeleteBus = async (req, res, next) => {
    try {
        const id = Number(req.body.id);
        if (!id) {
            return res.status(400).json({ message: "Geçersiz otobüs bilgisi" });
        }

        const deleted = await req.models.Bus.destroy({ where: { id } });
        if (!deleted) {
            return res.status(404).json({ message: "Otobüs bulunamadı" });
        }

        res.json({ message: "Silindi" });
    } catch (err) {
        console.error("Bus delete error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getBusModelsData = async (req, res, next) => {
    try {
        const busModels = await req.models.BusModel.findAll();
        res.json(busModels);
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getBusesData = async (req, res, next) => {
    try {
        const buses = await req.models.Bus.findAll();
        const staffs = await req.models.Staff.findAll();

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

        const bus = await req.models.Bus.findOne({ where: { id: busId } });
        if (!bus) {
            return res.status(404).json({ message: "Otobüs bulunamadı" });
        }

        await req.models.Trip.update({
            busId: bus.id,
            busModelId: bus.busModelId,
            captainId: bus.captainId
        }, { where: { id: tripId } });

        const captain = await req.models.Staff.findOne({ where: { id: bus.captainId } });

        res.json({ message: "Güncellendi", busModelId: bus.busModelId, captain });
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.postTripBusPlan = async (req, res, next) => {
    try {
        const { tripId, busModelId } = req.body;

        await req.models.Trip.update({
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
        await req.models.Trip.update({
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
        await req.models.Trip.update({
            isActive: isActive === 'true' || isActive === true,
        }, { where: { id: tripId } });
        res.json({ message: "Güncellendi" });
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getStaffsList = async (req, res, next) => {
    const staff = await req.models.Staff.findAll({});
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
    const stf = await req.models.Staff.findOne({ where: { id } });
    res.json(stf);
};

exports.postSaveStaff = async (req, res, next) => {
    try {
        const data = convertEmptyFieldsToNull(req.body);
        const { id, idNumber, duty, name, surname, address, phoneNumber, gender, nationality } = data;

        const [staff, created] = await req.models.Staff.upsert(
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

exports.postDeleteStaff = async (req, res, next) => {
    try {
        const id = Number(req.body.id);
        if (!id) {
            return res.status(400).json({ message: "Geçersiz personel bilgisi" });
        }

        const staff = await req.models.Staff.findByPk(id);
        if (!staff) {
            return res.status(404).json({ message: "Personel bulunamadı" });
        }

        await staff.destroy();
        res.json({ message: "Silindi" });
    } catch (err) {
        console.error("Staff delete error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getStopsList = async (req, res, next) => {
    const stops = await req.models.Stop.findAll();
    const places = await req.commonModels.Place.findAll()

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
    const stop = await req.models.Stop.findOne({ where: { id } });
    res.json(stop);
};

exports.getStopsData = async (req, res, next) => {
    try {
        const stops = await req.models.Stop.findAll();
        res.json(stops);
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getPlacesData = async (req, res, next) => {
    try {
        const places = await req.commonModels.Place.findAll();
        res.json(places);
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.postSaveStop = async (req, res, next) => {
    try {
        const data = convertEmptyFieldsToNull(req.body);
        const { id, title, webTitle, placeId, UETDS_code, isServiceArea, isActive } = data;

        const [stop, created] = await req.models.Stop.upsert(
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

exports.postDeleteStop = async (req, res, next) => {
    try {
        const id = Number(req.body.id);
        if (!id) {
            return res.status(400).json({ message: "Geçersiz durak bilgisi" });
        }

        const stop = await req.models.Stop.findByPk(id);
        if (!stop) {
            return res.status(404).json({ message: "Durak bulunamadı" });
        }

        await stop.destroy();
        res.json({ message: "Silindi" });
    } catch (err) {
        console.error("Stop delete error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getRoutesData = async (req, res, next) => {
    try {
        const routes = await req.models.Route.findAll();
        res.json(routes);
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getRoutesList = async (req, res, next) => {
    const routes = await req.models.Route.findAll()
    const stopIds = routes.flatMap(route => [route.fromStopId, route.toStopId]);
    const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: stopIds } } });

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

    const route = await req.models.Route.findOne({ where: { id: id, title: title } })

    res.json(route)
}

exports.getRouteStop = async (req, res, next) => {
    try {
        const { stopId, duration, isFirst } = req.query

        let routeStop = {};

        routeStop.isFirst = isFirst
        routeStop.duration = duration
        routeStop.stopId = stopId
        const stop = await req.models.Stop.findOne({ where: { id: stopId } })
        routeStop.stop = stop.title

        res.render("mixins/routeStop", { routeStop })
    }
    catch (err) {
        console.log(err)
    }
}

exports.getRouteStopsList = async (req, res, next) => {
    const { id } = req.query

    const routeStops = await req.models.RouteStop.findAll({ where: { routeId: id }, order: [["order", "ASC"]] });
    const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

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

        const [route, created] = await req.models.Route.upsert(
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

            await req.models.RouteStop.create({
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

exports.postDeleteRoute = async (req, res, next) => {
    try {
        const id = Number(req.body.id);
        if (!id) {
            return res.status(400).json({ message: "Geçersiz hat bilgisi" });
        }

        const route = await req.models.Route.findByPk(id);
        if (!route) {
            return res.status(404).json({ message: "Hat bulunamadı" });
        }

        await req.models.RouteStop.destroy({ where: { routeId: id } });
        await route.destroy();

        res.json({ message: "Silindi" });
    } catch (err) {
        console.error("Route delete error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getTripsList = async (req, res, next) => {
    const date = req.query.date
    const trips = await req.models.Trip.findAll({ where: { date: date } })
    const routes = await req.models.Route.findAll()
    const bus = await req.models.Bus.findAll()

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

        const route = await req.models.Route.findOne({ where: { id: routeId } });
        if (!route) {
            return res.status(404).json({ error: "Hat bulunamadı" });
        }

        const routeStops = await req.models.RouteStop.findAll({ where: { routeId: route.id }, order: [["order", "ASC"]] });
        const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(routeStops.map(rs => rs.stopId))] } } })

        const captainId = await req.models.Bus.findOne({ where: { id: busId } })?.captainId

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
                toPlaceString: toStop.title,
            });
        }

        // topluca insert → performanslı
        await req.models.Trip.bulkCreate(trips);

        return res.status(201).json({ message: `${trips.length} sefer başarıyla eklendi` });
    } catch (err) {
        console.error("postSaveTrip error:", err);
        return res.status(500).json({ error: "Bir hata oluştu", detail: err.message });
    }
};

exports.getBranchesList = async (req, res, next) => {
    let where = {}
    if (req.query.isJustActives) {
        where.isActive = true
    }

    const branches = await req.models.Branch.findAll({ where: where })
    const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: [...new Set(branches.map(b => b.stopId))] } } })

    for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        b.placeStr = stops.find(s => s.id == b.stopId)?.title;
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

    const branch = await req.models.Branch.findOne({ where: { id: id, title: title } })

    res.json(branch)
}

exports.postSaveBranch = async (req, res, next) => {
    try {
        console.log("Gelen veri:", req.body);

        const data = convertEmptyFieldsToNull(req.body);

        const { id, isActive, isMainBranch, title, stop, mainBranch } = data;

        const [branch, created] = await req.models.Branch.upsert(
            {
                id,
                title,
                stopId: stop,
                isMainBranch,
                mainBranchId: isMainBranch ? null : mainBranch,
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

exports.postDeleteBranch = async (req, res, next) => {
    try {
        const id = Number(req.body.id);
        if (!id) {
            return res.status(400).json({ message: "Geçersiz şube bilgisi" });
        }

        const deleted = await req.models.Branch.destroy({ where: { id } });
        if (!deleted) {
            return res.status(404).json({ message: "Şube bulunamadı" });
        }

        res.json({ message: "Silindi" });
    } catch (err) {
        console.error("Branch delete error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getUsersList = async (req, res, next) => {
    const users = await req.models.FirmUser.findAll()
    const branches = await req.models.Branch.findAll()

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

    const customers = await req.models.Customer.findAll({ where });
    res.render("mixins/customersList", { customers, blacklist });
}

exports.getCustomer = async (req, res, next) => {
    const { idNumber } = req.query;
    const where = {}

    if (idNumber) where.idNumber = Number(idNumber);

    const customer = await req.models.Customer.findOne({ where });
    res.json(customer);
}

exports.getMembersList = async (req, res, next) => {
    const { idNumber = "", name = "", surname = "", phone = "" } = req.query;

    const where = { customerCategory: 'member' };

    if (idNumber) {
        where.idNumber = { [Op.like]: `%${idNumber}%` };
    }
    if (name) {
        where.name = { [Op.like]: `%${name.toLocaleUpperCase("tr-TR")}%` };
    }
    if (surname) {
        where.surname = { [Op.like]: `%${surname.toLocaleUpperCase("tr-TR")}%` };
    }
    if (phone) {
        where.phoneNumber = { [Op.like]: `%${phone}%` };
    }

    const members = await req.models.Customer.findAll({ where });
    res.render("mixins/membersList", { members });
}

exports.postAddMember = async (req, res, next) => {
    try {
        const { idNumber, name, surname, phone } = req.body;
        const idNum = Number(idNumber);

        let customer = await req.models.Customer.findOne({ where: { idNumber: idNum } });

        if (customer) {
            customer.name = name.toLocaleUpperCase("tr-TR");
            customer.surname = surname.toLocaleUpperCase("tr-TR");
            customer.phoneNumber = phone;
            customer.customerCategory = 'member';
            await customer.save();
        } else {
            customer = await req.models.Customer.create({
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

exports.getMemberTickets = async (req, res, next) => {
    try {
        const { idNumber } = req.query;
        if (!idNumber) {
            return res.render("mixins/memberTickets", { tickets: [] });
        }
        const customer = await req.models.Customer.findOne({ where: { idNumber } });
        if (!customer) {
            return res.render("mixins/memberTickets", { tickets: [] });
        }

        const tickets = await req.models.Ticket.findAll({
            where: { customerId: customer.id },
            order: [["createdAt", "DESC"]]
        });

        const stopIds = [];
        tickets.forEach(t => {
            if (t.fromRouteStopId) stopIds.push(t.fromRouteStopId);
            if (t.toRouteStopId) stopIds.push(t.toRouteStopId);
        });
        const uniqueStopIds = [...new Set(stopIds)];
        const stops = await req.models.Stop.findAll({ where: { id: { [Op.in]: uniqueStopIds } }, raw: true });
        const stopMap = {};
        stops.forEach(s => stopMap[s.id] = s.title);

        const ticketData = tickets.map(t => ({
            pnr: t.pnr,
            from: stopMap[t.fromRouteStopId] || "",
            to: stopMap[t.toRouteStopId] || "",
            price: t.price,
            date: t.createdAt ? new Date(t.createdAt).toLocaleDateString("tr-TR") : ""
        }));

        res.render("mixins/memberTickets", { tickets: ticketData });
    } catch (err) {
        console.error("getMemberTickets error:", err);
        res.render("mixins/memberTickets", { tickets: [] });
    }
}

exports.postCustomerBlacklist = async (req, res, next) => {
    try {
        const { id, description, isRemove } = req.body;
        const customer = await req.models.Customer.findByPk(id);
        if (!customer) return res.status(404).json({ success: false });
        if (!isRemove) {
            customer.isBlackList = true;
            customer.blackListDescription = description;
        }
        else {
            customer.isBlackList = false;
            customer.blackListDescription = "";
        }
        await customer.save();
        res.status(200).json({ success: true });
    } catch (err) {
        console.error("Customer blacklist error:", err);
        res.status(500).json({ success: false });
    }
};

exports.getUser = async (req, res, next) => {
    const id = req.query.id;
    const username = req.query.username;

    let user = null;
    if (id) {
        user = await req.models.FirmUser.findByPk(id);
    } else if (username) {
        user = await req.models.FirmUser.findOne({ where: { username } });
    }

    const permissions = await req.models.Permission.findAll({ attributes: ['id', 'description', 'module'] });
    const userPerms = id ? await req.models.FirmUserPermission.findAll({ where: { firmUserId: id } }) : [];

    const grouped = { register: [], trip: [], sales: [], account_cut: [] };
    permissions.forEach(p => {
        const allow = userPerms.some(up => up.permissionId === p.id && up.allow);
        const item = { id: p.id, description: p.description, allow };
        switch ((p.module || '').toLowerCase()) {
            case 'register':
                grouped.register.push(item);
                break;
            case 'trip':
                grouped.trip.push(item);
                break;
            case 'sales':
                grouped.sales.push(item);
                break;
            case 'account_cut':
                grouped.account_cut.push(item);
                break;
        }
    });

    res.json({ ...(user ? user.dataValues : {}), permissions: grouped });
};

exports.getUsersByBranch = async (req, res, next) => {
    const branchId = req.query.id

    const users = await req.models.FirmUser.findAll({ where: { branchId: branchId } })

    res.json(users)
}

exports.postSaveUser = async (req, res, next) => {
    try {
        const data = convertEmptyFieldsToNull(req.body);
        const { id, isActive, name, username, password, phone, branchId } = data;
        const permissions = JSON.parse(data.permissions)

        let hashedPassword;

        if (password) {
            // Yeni şifre varsa hashle
            hashedPassword = await bcrypt.hash(password, 12);
        } else if (id) {
            // Güncelleme ise ve şifre yoksa eski şifreyi al
            const existingUser = await req.models.FirmUser.findByPk(id);
            hashedPassword = existingUser ? existingUser.password : null;
        } else {
            // Yeni kullanıcı ekleniyor ama şifre yoksa hata döndür
            return res.status(400).json({ message: "Yeni kullanıcı için şifre zorunlu" });
        }

        const [user, created] = await req.models.FirmUser.upsert(
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

        const permIds = permissions ? (Array.isArray(permissions) ? permissions : [permissions]).map(Number) : [];

        const existingPerms = await req.models.FirmUserPermission.findAll({ where: { firmUserId: user.id } });
        const existingIds = existingPerms.map(p => p.permissionId);

        const permsToAdd = permIds.filter(id => !existingIds.includes(id));
        const permsToRemove = existingIds.filter(id => !permIds.includes(id));

        if (permsToRemove.length) {
            await req.models.FirmUserPermission.destroy({ where: { firmUserId: user.id, permissionId: permsToRemove } });
        }

        if (permsToAdd.length) {
            const rows = permsToAdd.map(p => ({ firmUserId: user.id, permissionId: p, allow: true }));
            await req.models.FirmUserPermission.bulkCreate(rows);
        }

        if (created) {
            const cashRegister = req.models.CashRegister.build({
                userId: user.id,
                cash_balance: 0.00,
                card_balance: 0.00,
                reset_date_time: new Date()
            })

            await cashRegister.save()
        }

        res.json({
            message: created ? "Eklendi" : "Güncellendi",
            user
        });

    } catch (err) {
        console.error("Hata:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.postDeleteUser = async (req, res, next) => {
    try {
        const id = Number(req.body.id);
        if (!id) {
            return res.status(400).json({ message: "Geçersiz kullanıcı bilgisi" });
        }

        const user = await req.models.FirmUser.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: "Kullanıcı bulunamadı" });
        }

        await req.models.FirmUserPermission.destroy({ where: { firmUserId: id } });
        await req.models.CashRegister.destroy({ where: { userId: id } });
        await user.destroy();

        res.json({ message: "Silindi" });
    } catch (err) {
        console.error("User delete error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getTransactions = async (req, res, next) => {
    try {
        const userId = req.query.userId || req.session.user.id;
        const register = await req.models.CashRegister.findOne({ where: { userId } });
        if (!register) throw new Error("Kasa kaydı bulunamadı.");

        // Tarihe göre yeni → eski
        const transactions = await req.models.Transaction.findAll({
            where: {
                userId,
                createdAt: { [Op.gte]: register.reset_date_time }
            },
            order: [["createdAt", "DESC"]]
        });

        if (transactions.length) {
            transactions[transactions.length - 1].amount = ""
        }

        // Ticket bilgilerini Promise.all ile ekle
        await Promise.all(transactions.map(async (t) => {
            if (t.ticketId) {
                const ticket = await req.models.Ticket.findOne({ where: { id: t.ticketId } });
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
        const register = await req.models.CashRegister.findOne({ where: { userId } });
        if (!register) throw new Error("Kasa kaydı bulunamadı.");

        const transactions = await req.models.Transaction.findAll({
            where: {
                userId,
                createdAt: { [Op.gt]: new Date(register.reset_date_time) }
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
            otherOut,
            card_balance: register.card_balance,
            cash_balance: register.cash_balance
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
        const register = await req.models.CashRegister.findOne({ where: { userId } });
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

        const transaction = req.models.Transaction.build({
            userId: req.session.user.id,
            type: type,
            category: type,
            amount: amount,
            description: description,
        });

        await transaction.save();
        res.locals.newRecordId = transaction.id;

        const register = await req.models.CashRegister.findOne({ where: { userId: req.session.user.id } });
        if (!register) {
            throw new Error("Kasa kaydı bulunamadı.");
        }

        if (type === "income") {
            register.cash_balance = Number(register.cash_balance) + Number(amount);
        } else if (type === "expense") {
            register.cash_balance = Number(register.cash_balance) - Number(amount);
        }
        await register.save();

        res.status(200).json({ success: true, transactionId: transaction.id });
    } catch (err) {
        console.error("Cash transaction error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
}

exports.postResetRegister = async (req, res, next) => {
    try {
        const register = await req.models.CashRegister.findOne({ where: { userId: req.session.user.id } });
        if (!register) return res.status(404).json({ message: "Kasa kaydı bulunamadı." });

        const total = Number(register.cash_balance) + Number(register.card_balance);

        await req.models.Transaction.create({
            userId: req.session.user.id,
            type: "expense",
            category: "register_reset",
            amount: total,
            description: "Kasa sıfırlandı. Önceki bakiye: " + total + "₺"
        });

        register.cash_balance = 0;
        register.card_balance = 0;
        register.reset_date_time = new Date();
        await register.save();

        res.json({ success: true });
    } catch (err) {
        console.error("Reset register error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.postTransferRegister = async (req, res, next) => {
    try {
        const targetUserId = Number(req.body.user);
        if (!targetUserId) return res.status(400).json({ message: "Kullanıcı bilgisi eksik." });

        const senderId = req.session.user.id;
        const users = await req.models.FirmUser.findAll({ where: { id: { [Op.in]: [senderId, targetUserId] } } });

        const sender = users.find(u => u.id == senderId);
        const receiver = users.find(u => u.id == targetUserId);

        const senderRegister = await req.models.CashRegister.findOne({ where: { userId: senderId } });

        const cashBalance = Number(senderRegister.cash_balance) || 0;
        const cardBalance = Number(senderRegister.card_balance) || 0;
        const total = cashBalance + cardBalance;

        await req.models.Payment.create({
            initiatorId: receiver.id,
            payerId: sender.id,
            receiverId: receiver.id,
            amount: total,
            card_amount: cardBalance,
            cash_amount: cashBalance,
            isWholeTransfer: true
        });
        console.log(senderRegister.cash_balance)

        res.json({ success: true });
    } catch (err) {
        console.error("Transfer register error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.postRequestPayment = async (req, res, next) => {
    try {
        const { userId, amount } = req.body;
        await req.models.Payment.create({
            initiatorId: userId,
            payerId: userId,
            receiverId: req.session.user.id,
            amount,
            cash_amount: amount,
            isWholeTransfer: false
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
        await req.models.Payment.create({
            initiatorId: userId,
            payerId: req.session.user.id,
            receiverId: userId,
            amount,
            cash_amount: amount,
            isWholeTransfer: false
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Send payment error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getPendingPayments = async (req, res, next) => {
    try {
        const payments = await req.models.Payment.findAll({ where: { payerId: req.session.user.id, status: "pending" } });
        const users = await req.models.FirmUser.findAll({ where: { id: { [Op.in]: [...new Set(payments.map(p => p.receiverId))] } } });
        if (!payments.length) {
            res.status(404);
        }
        const result = payments.map(p => ({
            id: p.id,
            amount: p.amount,
            userName: users.find(u => u.id == p.receiverId)?.name || "",
            canConfirm: p.initiatorId == req.session.user.id,
            type: p.isWholeTransfer ? "Kasa Devri" : "Manuel İşlem"
        }));
        res.render("mixins/paymentsList", { payments: result });
    } catch (err) {
        console.error("Pending payments error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getPendingCollections = async (req, res, next) => {
    try {
        console.log(req.session.user.id)
        const payments = await req.models.Payment.findAll({ where: { receiverId: req.session.user.id, initiatorId: req.session.user.id, status: "pending" } });
        if (!payments.length) {
            res.status(404);
        }
        const users = await req.models.FirmUser.findAll({ where: { id: { [Op.in]: [...new Set(payments.map(p => p.payerId))] } } });
        const result = payments.map(p => ({
            id: p.id,
            amount: p.amount,
            userName: users.find(u => u.id == p.payerId)?.name || "",
            canConfirm: p.initiatorId == req.session.user.id,
            type: p.isWholeTransfer ? "Kasa Devri" : "Manuel İşlem"
        }));
        res.render("mixins/paymentsList", { payments: result });
    } catch (err) {
        console.error("Pending collections error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.postConfirmPayment = async (req, res, next) => {
    try {
        const { id, action } = req.body;
        const payment = await req.models.Payment.findOne({ where: { id } });
        const users = await req.models.FirmUser.findAll({ where: { id: { [Op.in]: [payment.payerId, payment.receiverId] } } })

        if (!payment) return res.status(404).json({ message: "Ödeme kaydı bulunamadı." });
        if (payment.status !== "pending") return res.status(400).json({ message: "Ödeme zaten işlenmiş." });
        if (payment.initiatorId !== req.session.user.id) return res.status(403).json({ message: "Onay yetkiniz yok." });

        if (Number(payment.amount) === 0) {
            payment.status = action == "approve" ? "approved" : "rejected";
            await payment.save();
            return res.json({ success: true });
        }

        payment.status = action == "approve" ? "approved" : "rejected";
        await payment.save();

        if (action == "approve") {
            await req.models.Transaction.create({
                userId: users.find(u => u.id == payment.receiverId).id,
                type: "income",
                category: "transfer_in",
                amount: Number(payment.amount),
                description: payment.isWholeTransfer ?
                    `${users.find(u => u.id == payment.payerId).name}  isimli kullanıcıdan devralınan kasa.` : `${users.find(u => u.id == payment.payerId).name} isimli kullanıcıdan alınan ödeme.`,
            })

            await req.models.Transaction.create({
                userId: users.find(u => u.id == payment.payerId).id,
                type: "expense",
                category: "transfer_out",
                amount: Number(payment.amount),
                description: payment.isWholeTransfer ?
                    `${users.find(u => u.id == payment.receiverId).name} isimli kullanıcıya devredilen kasa. Devir: ${payment.amount}₺` :
                    `${users.find(u => u.id == payment.receiverId).name} isimli kullanıcıya yapılan ödeme.`
            })

            await req.models.CashRegister.findOne({ where: { userId: payment.receiverId } }).then(async cr => {
                if (cr) {
                    cr.cash_balance = Number(cr.cash_balance) + Number(payment.cash_amount);
                    cr.card_balance = Number(cr.card_balance) + Number(payment.card_amount);
                    await cr.save();
                }
            })

            await req.models.CashRegister.findOne({ where: { userId: payment.payerId } }).then(async cr => {
                if (cr) {
                    cr.cash_balance = Number(cr.cash_balance) - Number(payment.cash_amount);
                    cr.card_balance = Number(cr.card_balance) - Number(payment.card_amount);
                    if (payment.isWholeTransfer)
                        cr.reset_date_time = new Date()
                    await cr.save();
                }
            })
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Confirm payment error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.postSaveAnnouncement = async (req, res, next) => {
    try {
        const { message, branchId, showTicker, showPopup } = req.body;
        const announcement = await req.models.Announcement.create({
            message,
            branchId: branchId || null,
            showTicker: showTicker === true || showTicker === 'true',
            showPopup: showPopup === false ? false : true,
        });
        res.json({ message: "Eklendi", announcement });
    } catch (err) {
        console.error("Save announcement error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getAnnouncements = async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        const branchId = req.session.user.branchId;

        const announcements = await req.models.Announcement.findAll({
            where: {
                isActive: true,
                [Op.or]: [
                    { branchId: null },
                    { branchId: branchId }
                ]
            },
            order: [["createdAt", "DESC"]]
        });

        const seenRows = await req.models.AnnouncementUser.findAll({
            where: { userId },
            attributes: ["announcementId"]
        });
        const seenIds = seenRows.map(r => r.announcementId);

        const ticker = announcements.filter(a => a.showTicker);
        const popup = announcements.filter(a => a.showPopup && !seenIds.includes(a.id));

        res.json({ ticker, popup });
    } catch (err) {
        console.error("Get announcements error:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getDailyUserAccountReport = async (req, res, next) => {
    try {
        const { startDate, endDate, userId } = req.query;
        const targetUserId = userId || req.session.user?.id;

        if (!targetUserId) {
            return res.status(400).json({ message: 'Kullanıcı bilgisi eksik.' });
        }

        const user = await req.models.FirmUser.findOne({ where: { id: targetUserId }, attributes: ['name', 'branchId'], raw: true });
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        const branch = user.branchId
            ? await req.models.Branch.findOne({ where: { id: user.branchId }, attributes: ['title'], raw: true })
            : null;

        const register = await req.models.CashRegister.findOne({ where: { userId: targetUserId }, raw: true });

        const parseDate = (value) => {
            if (!value) return null;
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };

        const now = new Date();
        let start = parseDate(startDate) || parseDate("1970-01-01 00:00:00");
        let end = parseDate(endDate) || now;

        if (start > end) {
            const tmp = start;
            start = end;
            end = tmp;
        }

        const transactions = await req.models.Transaction.findAll({
            where: {
                userId: targetUserId,
                createdAt: { [Op.between]: [start, end] }
            },
            order: [["createdAt", "DESC"]],
            raw: true,
        });

        const ticketIds = transactions.map(t => t.ticketId).filter(Boolean);
        const tickets = ticketIds.length
            ? await req.models.Ticket.findAll({
                where: { id: { [Op.in]: ticketIds } },
                attributes: ['id', 'pnr', 'seatNo'],
                raw: true,
            })
            : [];
        const ticketMap = new Map(tickets.map(t => [t.id, t]));

        const categoryLabels = {
            cash_sale: 'Nakit satış',
            card_sale: 'K.Kartı satış',
            cash_refund: 'Nakit iade',
            card_refund: 'K.Kartı iade',
            payed_to_bus: 'Otobüse ödenen',
            income: 'Gelir',
            expense: 'Gider',
            transfer_in: 'Devir alındı',
            transfer_out: 'Devir verildi',
            register_reset: 'Kasa sıfırlama',
        };

        const summaryTotals = {
            ticketSalesCount: 0,
            ticketRefundCount: 0,
            cashSalesTotal: 0,
            cashRefundTotal: 0,
            cardSalesTotal: 0,
            cardRefundTotal: 0,
            payedToBusTotal: 0,
            otherIncomeTotal: 0,
            otherExpenseTotal: 0,
            transferInTotal: 0,
            transferOutTotal: 0,
            registerResetTotal: 0,
        };

        const formatDateTime = (value) => {
            if (!value) return '';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '';
            return new Intl.DateTimeFormat('tr-TR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Europe/Istanbul',
            }).format(date);
        };

        const rows = transactions.map(t => {
            const amount = Number(t.amount) || 0;
            switch (t.category) {
                case 'cash_sale':
                    summaryTotals.ticketSalesCount += 1;
                    summaryTotals.cashSalesTotal += amount;
                    break;
                case 'card_sale':
                    summaryTotals.ticketSalesCount += 1;
                    summaryTotals.cardSalesTotal += amount;
                    break;
                case 'cash_refund':
                    summaryTotals.ticketRefundCount += 1;
                    summaryTotals.cashRefundTotal += amount;
                    break;
                case 'card_refund':
                    summaryTotals.ticketRefundCount += 1;
                    summaryTotals.cardRefundTotal += amount;
                    break;
                case 'payed_to_bus':
                    summaryTotals.payedToBusTotal += amount;
                    break;
                case 'income':
                    summaryTotals.otherIncomeTotal += amount;
                    break;
                case 'expense':
                    summaryTotals.otherExpenseTotal += amount;
                    break;
                case 'transfer_in':
                    summaryTotals.transferInTotal += amount;
                    break;
                case 'transfer_out':
                    summaryTotals.transferOutTotal += amount;
                    break;
                case 'register_reset':
                    summaryTotals.registerResetTotal += amount;
                    break;
                default:
                    break;
            }

            const ticket = t.ticketId ? ticketMap.get(t.ticketId) : null;
            const documentParts = [];
            if (ticket?.seatNo) documentParts.push(`KN: ${ticket.seatNo}`);
            if (ticket?.pnr) documentParts.push(`PNR: ${ticket.pnr}`);

            return {
                date: formatDateTime(t.createdAt),
                type: categoryLabels[t.category] || t.category,
                description: t.description || '',
                document: documentParts.join(' '),
                amount: t.type === 'income' ? formatDailyCurrency(amount) : "-" + formatDailyCurrency(amount),
                incomeOrExpense: t.type === 'income' ? "Gelir" : 'Gider',
            };
        });

        const totalSales = summaryTotals.cashSalesTotal + summaryTotals.cardSalesTotal + summaryTotals.pointSalesTotal;
        const totalRefunds = summaryTotals.cashRefundTotal + summaryTotals.cardRefundTotal + summaryTotals.pointRefundTotal;
        const netTransfer = summaryTotals.transferInTotal - summaryTotals.transferOutTotal;
        const netCash = (summaryTotals.cashSalesTotal - summaryTotals.cashRefundTotal)
            + summaryTotals.otherIncomeTotal
            + summaryTotals.transferInTotal
            - summaryTotals.transferOutTotal
            - summaryTotals.payedToBusTotal
            - summaryTotals.otherExpenseTotal
            - summaryTotals.registerResetTotal;
        const netCard = summaryTotals.cardSalesTotal - summaryTotals.cardRefundTotal;
        const netTotal = netCash + netCard;

        const summaryItems = [
            { label: 'Satış Adedi', value: String(summaryTotals.ticketSalesCount) },
            { label: 'İade Adedi', value: String(summaryTotals.ticketRefundCount) },
            { label: 'Nakit Satış Tutarı', value: formatDailyCurrency(summaryTotals.cashSalesTotal) },
            { label: 'Nakit İade Tutarı', value: formatDailyCurrency(summaryTotals.cashRefundTotal) },
            { label: 'K.K. Satış Tutarı', value: formatDailyCurrency(summaryTotals.cardSalesTotal) },
            { label: 'K.K. İade Tutarı', value: formatDailyCurrency(summaryTotals.cardRefundTotal) },
            { label: 'Toplam Satış Tutarı', value: formatDailyCurrency(totalSales) },
            { label: 'Toplam İade Tutarı', value: formatDailyCurrency(totalRefunds) },
            { label: 'Diğer Gelirler', value: formatDailyCurrency(summaryTotals.otherIncomeTotal) },
            { label: 'Diğer Giderler', value: formatDailyCurrency(summaryTotals.otherExpenseTotal) },
            { label: 'Otobüs Ödemeleri', value: formatDailyCurrency(summaryTotals.payedToBusTotal) },
            { label: 'Transfer Alınan', value: formatDailyCurrency(summaryTotals.transferInTotal) },
            { label: 'Transfer Verilen', value: formatDailyCurrency(summaryTotals.transferOutTotal) },
            { label: 'Kullancılardan Alınan', value: formatDailyCurrency(netTransfer) },
        ];

        if (summaryTotals.registerResetTotal) {
            summaryItems.push({ label: 'Kasa Sıfırlama', value: formatDailyCurrency(summaryTotals.registerResetTotal) });
        }

        const netSummary = [
            { label: 'Nakit', value: formatDailyCurrency(netCash) },
            { label: 'Kredi Kartı', value: formatDailyCurrency(netCard) },
            { label: 'Toplam', value: formatDailyCurrency(netTotal) },
        ];

        const formatRange = (date) => formatDateTime(date)?.replace(',', '');

        const queryInfo = {
            user: user.name,
            branch: branch?.title || '',
            startDate: formatRange(start),
            endDate: formatRange(end),
            generatedAt: formatRange(now),
        };

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="daily_user_account_report.pdf"');
        await generateDailyUserAccountReport({ rows, summaryItems, netSummary, query: queryInfo }, res);
    } catch (err) {
        console.error('getDailyUserAccountReport error:', err);
        res.status(500).json({ message: 'Günlük kullanıcı raporu oluşturulamadı.' });
    }
};

exports.getSalesRefundsReport = async (req, res, next) => {
    try {
        const { startDate, endDate, type, branchId, userId, fromStopId, toStopId } = req.query;
        const start = startDate ? new Date(startDate) : new Date('1970-01-01');
        const end = endDate ? new Date(endDate) : new Date();

        const query = {
            type: type,
            startDate: startDate,
            endDate: endDate,
            branch: branchId ? await req.models.Branch.findOne({ where: { id: branchId } }).title : "Tümü",
            user: userId ? await req.models.FirmUser.findOne({ where: { id: userId } }).title : "Tümü",
            from: fromStopId ? await req.models.Stop.findOne({ where: { id: fromStopId } }).title : "Tümü",
            to: toStopId ? await req.models.Stop.findOne({ where: { id: toStopId } }).title : "Tümü",
        }

        console.log(start)
        console.log(end)
        const where = {
            createdAt: { [Op.between]: [start, end] },
            status: { [Op.in]: ['completed', 'web', 'gotur', 'refund'] }
        };

        if (userId) where.userId = userId;
        if (fromStopId) where.fromRouteStopId = fromStopId;
        if (toStopId) where.toRouteStopId = toStopId;

        let tickets = await req.models.Ticket.findAll({
            where,
            order: [['createdAt', 'ASC']]
        });

        if (branchId) {
            const branchUsers = await req.models.FirmUser.findAll({ where: { branchId }, attributes: ['id'], raw: true });
            const branchUserIds = branchUsers.map(u => u.id);
            tickets = tickets.filter(t => branchUserIds.includes(t.userId));
        }

        const userIds = [...new Set(tickets.map(t => t.userId).filter(Boolean))];
        const stopIds = [...new Set(tickets.flatMap(t => [t.fromRouteStopId, t.toRouteStopId]).filter(Boolean))];

        const users = await req.models.FirmUser.findAll({
            where: { id: { [Op.in]: userIds } },
            attributes: ['id', 'name', 'branchId']
        });

        const branchIds = [...new Set(users.map(u => u.branchId).filter(Boolean))];

        const [stops, branches] = await Promise.all([
            req.models.Stop.findAll({ where: { id: { [Op.in]: stopIds } }, attributes: ['id', 'title'] }),
            req.models.Branch.findAll({ where: { id: { [Op.in]: branchIds } }, attributes: ['id', 'title'] })
        ]);

        const rows = tickets.map(t => {
            const user = users.find(u => u.id === t.userId);
            return {
                user: user?.name || '',
                branch: branches.find(b => b.id === user?.branchId)?.title || '',
                time: t.createdAt,
                from: stops.find(s => s.id === t.fromRouteStopId)?.title || '',
                to: stops.find(s => s.id === t.toRouteStopId)?.title || '',
                payment: t.payment,
                status: t.status,
                seat: t.seatNo,
                gender: t.gender === 'f' ? 'K' : 'E',
                pnr: t.pnr,
                price: t.price
            };
        });

        if ((type || '').toLowerCase() === 'detaylı' || (type || '').toLowerCase() === 'detayli' || (type || '').toLowerCase() === 'detailed') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename="sales_refunds_detailed.pdf"');
            await generateSalesRefundReportDetailed(rows, query, res);
        } else {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename="sales_refunds_summary.pdf"');
            await generateSalesRefundReportSummary(rows, query, res);
        }
    } catch (err) {
        console.error('getSalesRefundsReport error:', err);
        res.status(500).json({ message: 'Satışlar ve iadeler raporu oluşturulamadı.' });
    }
};

exports.getWebTicketsReport = async (req, res, next) => {
    try {
        const { startDate, endDate, type, branchId, userId, fromStopId, toStopId, groupBy } = req.query;

        const start = startDate ? new Date(startDate) : new Date('1970-01-01');
        const end = endDate ? new Date(endDate) : new Date();

        let branchTitle = 'Tümü';
        if (branchId) {
            const branch = await req.models.Branch.findOne({ where: { id: branchId }, attributes: ['title'], raw: true });
            if (branch?.title) branchTitle = branch.title;
        }

        let userName = 'Tümü';
        if (userId) {
            const user = await req.models.FirmUser.findOne({ where: { id: userId }, attributes: ['name'], raw: true });
            if (user?.name) userName = user.name;
        }

        let fromStopTitle = 'Tümü';
        if (fromStopId) {
            const fromStop = await req.models.Stop.findOne({ where: { id: fromStopId }, attributes: ['title'], raw: true });
            if (fromStop?.title) fromStopTitle = fromStop.title;
        }

        let toStopTitle = 'Tümü';
        if (toStopId) {
            const toStop = await req.models.Stop.findOne({ where: { id: toStopId }, attributes: ['title'], raw: true });
            if (toStop?.title) toStopTitle = toStop.title;
        }

        const queryInfo = {
            type,
            startDate,
            endDate,
            branch: branchTitle,
            user: userName,
            from: fromStopTitle,
            to: toStopTitle,
        };
        const normalizedGroup = (groupBy || '').toString().toLowerCase();
        const isStopRequested = normalizedGroup === 'stop' || normalizedGroup === 'durak';
        const effectiveGroup = isStopRequested ? 'stop' : 'bus';
        queryInfo.group = effectiveGroup === 'stop' ? 'Durak' : 'Otobüs';

        const where = {
            status: 'web',
            createdAt: { [Op.between]: [start, end] },
        };

        if (userId) where.userId = userId;
        if (fromStopId) where.fromRouteStopId = fromStopId;
        if (toStopId) where.toRouteStopId = toStopId;

        let tickets = await req.models.Ticket.findAll({
            where,
            raw: true,
        });

        if (branchId) {
            const branchUsers = await req.models.FirmUser.findAll({ where: { branchId }, attributes: ['id'], raw: true });
            const branchUserIds = branchUsers.map(u => u.id);
            tickets = tickets.filter(t => branchUserIds.includes(t.userId));
        }

        const normalizedType = (type || '').toLowerCase();
        const isDetailed = normalizedType === 'detailed' || normalizedType === 'detaylı' || normalizedType === 'detayli';
        const summaryFileName = effectiveGroup === 'stop'
            ? 'web_tickets_by_stop_summary.pdf'
            : 'web_tickets_by_bus_summary.pdf';
        const detailedFileName = effectiveGroup === 'stop'
            ? 'web_tickets_by_stop_detailed.pdf'
            : 'web_tickets_by_bus_detailed.pdf';

        if (!tickets.length) {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${isDetailed ? detailedFileName : summaryFileName}"`);
            if (isDetailed) {
                if (effectiveGroup === 'stop') {
                    await generateWebTicketsReportByStopDetailed([], queryInfo, res);
                } else {
                    await generateWebTicketsReportByBusDetailed([], queryInfo, res);
                }
            } else if (effectiveGroup === 'stop') {
                await generateWebTicketsReportByStopSummary([], queryInfo, res);
            } else {
                await generateWebTicketsReportByBusSummary([], queryInfo, res);
            }
            return;
        }

        const tripIds = [...new Set(tickets.map(t => t.tripId).filter(Boolean))];
        const trips = tripIds.length ? await req.models.Trip.findAll({
            where: { id: { [Op.in]: tripIds } },
            attributes: ['id', 'busId', 'routeId', 'date', 'time'],
            raw: true,
        }) : [];

        const busIds = [...new Set(trips.map(t => t.busId).filter(Boolean))];
        const routeIds = [...new Set(trips.map(t => t.routeId).filter(Boolean))];

        const [buses, routes] = await Promise.all([
            busIds.length ? req.models.Bus.findAll({ where: { id: { [Op.in]: busIds } }, attributes: ['id', 'licensePlate'], raw: true }) : [],
            routeIds.length ? req.models.Route.findAll({ where: { id: { [Op.in]: routeIds } }, attributes: ['id', 'title'], raw: true }) : [],
        ]);

        const routeStops = routeIds.length ? await req.models.RouteStop.findAll({
            where: { routeId: { [Op.in]: routeIds } },
            attributes: ['id', 'routeId', 'stopId', 'duration', 'order'],
            raw: true,
        }) : [];

        const stopIdsForRouteStops = routeStops.map(rs => rs.stopId).filter(Boolean);
        const directStopIds = tickets.map(t => t.fromRouteStopId).filter(Boolean);
        const combinedStopIds = [...new Set([...stopIdsForRouteStops, ...directStopIds])];
        const stopsForRouteStops = combinedStopIds.length ? await req.models.Stop.findAll({
            where: { id: { [Op.in]: combinedStopIds } },
            attributes: ['id', 'title'],
            raw: true,
        }) : [];

        const toKey = value => (value === undefined || value === null ? '' : String(value));

        const busMap = new Map(buses.map(b => [b.id, b.licensePlate]));
        const tripMap = new Map(trips.map(t => [t.id, t]));
        const routeMap = new Map(routes.map(r => [r.id, r.title]));
        const routeStopMap = new Map(routeStops.map(rs => [toKey(rs.id), rs]));
        const stopMap = new Map(stopsForRouteStops.map(s => [toKey(s.id), s.title]));

        const routeStopsByRoute = new Map();
        routeStops.forEach(rs => {
            const routeKey = toKey(rs.routeId);
            if (!routeStopsByRoute.has(routeKey)) {
                routeStopsByRoute.set(routeKey, []);
            }
            routeStopsByRoute.get(routeKey).push(rs);
        });

        routeStopsByRoute.forEach(list => {
            list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        });

        const parseDurationToMs = duration => {
            if (!duration) return 0;
            const [rawH = 0, rawM = 0, rawS = 0] = duration.split(':').map(Number);
            const hours = Number.isFinite(rawH) ? rawH : 0;
            const minutes = Number.isFinite(rawM) ? rawM : 0;
            const seconds = Number.isFinite(rawS) ? rawS : 0;
            return ((hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0)) * 1000;
        };

        const cumulativeDurationByRouteStopId = new Map();
        routeStopsByRoute.forEach(list => {
            let acc = 0;
            list.forEach(rs => {
                acc += parseDurationToMs(rs.duration);
                cumulativeDurationByRouteStopId.set(toKey(rs.id), acc);
            });
        });

        const routeStopByRouteAndStop = new Map();
        routeStops.forEach(rs => {
            const key = `${toKey(rs.routeId)}|${toKey(rs.stopId)}`;
            if (!routeStopByRouteAndStop.has(key)) {
                routeStopByRouteAndStop.set(key, rs);
            }
        });

        const combineDateAndTime = (dateStr, timeStr) => {
            if (!dateStr) return null;
            const [year, month, day] = dateStr.split('-').map(Number);
            if (!year || !month || !day) return null;
            const [hour = 0, minute = 0, second = 0] = (timeStr || '00:00:00').split(':').map(Number);
            return new Date(year, month - 1, day, hour || 0, minute || 0, second || 0);
        };
        const busSummaryRows = [];
        const stopSummaryRows = [];
        const detailedGroups = new Map();

        tickets.forEach(ticket => {
            const trip = ticket.tripId ? tripMap.get(ticket.tripId) : undefined;
            const busId = trip?.busId;
            const busKey = busId ?? 'unknown';
            const licensePlate = busMap.get(busId) || '-';
            const priceValue = Number(ticket.price) || 0;

            busSummaryRows.push({
                price: priceValue,
                busId: busKey,
                licensePlate,
            });

            const routeStopKey = toKey(ticket.fromRouteStopId);
            const routeStop = routeStopMap.get(routeStopKey)
                || (trip ? routeStopByRouteAndStop.get(`${toKey(trip.routeId)}|${routeStopKey}`) : undefined);
            const resolvedStopId = routeStop?.stopId ?? ticket.fromStopId ?? ticket.fromRouteStopId ?? null;
            const stopTitleFromRoute = routeStop ? (stopMap.get(toKey(routeStop.stopId)) || '') : '';
            const stopTitleFromDirect = resolvedStopId ? (stopMap.get(toKey(resolvedStopId)) || '') : '';
            const stopTitle = stopTitleFromRoute || stopTitleFromDirect || routeStopKey || '';
            const stopUniqueKey = resolvedStopId != null
                ? toKey(resolvedStopId)
                : (routeStopKey || (stopTitle || 'unknown'));

            stopSummaryRows.push({
                price: priceValue,
                salesTotal: priceValue,
                ticketCount: 1,
                stopId: resolvedStopId,
                routeStopId: routeStop?.id ?? ticket.fromRouteStopId ?? null,
                fromRouteStopId: ticket.fromRouteStopId,
                stopKey: resolvedStopId ?? ticket.fromRouteStopId ?? null,
                stopTitle,
            });
            const baseDate = combineDateAndTime(trip?.date, trip?.time);
            let departureDate = baseDate;
            if (routeStop && baseDate) {
                const cumulativeMs = cumulativeDurationByRouteStopId.get(toKey(routeStop.id));
                if (typeof cumulativeMs === 'number') {
                    departureDate = new Date(baseDate.getTime() + cumulativeMs);
                }
            }
            const routeTitle = trip?.routeId ? (routeMap.get(trip.routeId) || '') : '';

            const groupKey = `${busKey}|${trip?.id || 'unknown'}|${routeStopKey || 'unknown'}`;

            if (!detailedGroups.has(groupKey)) {
                detailedGroups.set(groupKey, {
                    busId: busKey,
                    licensePlate,
                    stopTitle,
                    routeTitle,
                    departure: departureDate,
                    salesTotal: 0,
                    ticketCount: 0,
                    stopKey: stopUniqueKey,
                });
            }

            const group = detailedGroups.get(groupKey);
            group.salesTotal += priceValue;
            group.ticketCount += 1;
            if (!group.stopTitle && stopTitle) group.stopTitle = stopTitle;
            if (!group.routeTitle && routeTitle) group.routeTitle = routeTitle;
            if (!group.licensePlate && licensePlate) group.licensePlate = licensePlate;
            if (!group.departure && departureDate) group.departure = departureDate;
            if ((!group.stopKey || group.stopKey === 'unknown') && stopUniqueKey) {
                group.stopKey = stopUniqueKey;
            }
        });

        const detailedRows = Array.from(detailedGroups.values());

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${isDetailed ? detailedFileName : summaryFileName}"`);

        if (isDetailed) {
            if (effectiveGroup === 'stop') {
                await generateWebTicketsReportByStopDetailed(detailedRows, queryInfo, res);
            } else {
                await generateWebTicketsReportByBusDetailed(detailedRows, queryInfo, res);
            }
        } else if (effectiveGroup === 'stop') {
            await generateWebTicketsReportByStopSummary(stopSummaryRows, queryInfo, res);
        } else {
            await generateWebTicketsReportByBusSummary(busSummaryRows, queryInfo, res);
        }
    } catch (err) {
        console.error('getWebTicketsReport error:', err);
        res.status(500).json({ message: 'Web bilet raporu oluşturulamadı.' });
    }
};

exports.getUpcomingTicketsReport = async (req, res, next) => {
    try {
        const now = new Date();
        const activeStatuses = ["completed", "web", "gotur"];

        const tickets = await req.models.Ticket.findAll({
            where: {
                status: { [Op.in]: activeStatuses },
                tripId: { [Op.ne]: null },
                fromRouteStopId: { [Op.ne]: null }
            },
            raw: true
        });

        const tripIds = [...new Set(tickets.map(t => t.tripId).filter(Boolean))];
        const trips = tripIds.length ? await req.models.Trip.findAll({
            where: { id: { [Op.in]: tripIds } },
            raw: true
        }) : [];

        const routeIds = [...new Set(trips.map(t => t.routeId).filter(Boolean))];
        const routeStops = routeIds.length ? await req.models.RouteStop.findAll({
            where: { routeId: { [Op.in]: routeIds } },
            order: [["routeId", "ASC"], ["order", "ASC"]],
            raw: true
        }) : [];

        console.log([...new Set(routeStops.map(rs => rs.id).filter(Boolean))])

        const stopIds = [...new Set(routeStops.map(rs => rs.stopId).filter(Boolean))];
        const stops = stopIds.length ? await req.models.Stop.findAll({
            where: { id: { [Op.in]: stopIds } },
            raw: true
        }) : [];

        const userIds = [...new Set(tickets.map(t => t.userId).filter(Boolean))];
        const users = userIds.length ? await req.models.FirmUser.findAll({
            where: { id: { [Op.in]: userIds } },
            raw: true
        }) : [];

        const branchIds = [...new Set(users.map(u => u.branchId).filter(Boolean))];
        const branches = branchIds.length ? await req.models.Branch.findAll({
            where: { id: { [Op.in]: branchIds } },
            raw: true
        }) : [];

        const toKey = value => (value === undefined || value === null) ? "" : String(value);

        const tripMap = new Map(trips.map(trip => [toKey(trip.id), trip]));
        const routeStopsByRoute = new Map();
        routeStops.forEach(rs => {
            const routeKey = toKey(rs.routeId);
            if (!routeStopsByRoute.has(routeKey)) {
                routeStopsByRoute.set(routeKey, []);
            }
            routeStopsByRoute.get(routeKey).push(rs);
        });

        const stopMap = new Map(stops.map(stop => [toKey(stop.id), stop.title]));
        const userMap = new Map(users.map(user => [toKey(user.id), user]));
        const branchMap = new Map(branches.map(branch => [toKey(branch.id), branch]));

        const parseDurationToSeconds = duration => {
            if (!duration) return 0;
            const [rawH = 0, rawM = 0, rawS = 0] = duration.split(":").map(Number);
            const hours = Number.isFinite(rawH) ? rawH : 0;
            const minutes = Number.isFinite(rawM) ? rawM : 0;
            const seconds = Number.isFinite(rawS) ? rawS : 0;
            return hours * 3600 + minutes * 60 + seconds;
        };

        const combineDateAndTime = (dateStr, timeStr) => {
            if (!dateStr) return null;
            const [year, month, day] = dateStr.split("-").map(Number);
            if (!year || !month || !day) return null;
            const [hour = 0, minute = 0, second = 0] = (timeStr || "00:00:00").split(":").map(Number);
            return new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, second || 0);
        };

        const formatRouteTitle = (fromTitle, toTitle) => {
            const safeFrom = fromTitle || "-";
            const safeTo = toTitle || "";
            return safeTo ? `${safeFrom} - ${safeTo}` : safeFrom;
        };

        const normalizePayment = payment => {
            const lowered = (payment || "").toLowerCase();
            if (lowered === "cash") return "cash";
            if (lowered === "card") return "card";
            if (lowered === "point") return "point";
            return "other";
        };

        const paymentLabel = type => {
            if (type === "cash") return "Nakit";
            if (type === "card") return "K.Kartı";
            if (type === "point") return "Puan";
            return "-";
        };

        const branchBuckets = new Map();
        const totals = {
            count: 0,
            amount: 0,
            payments: { cash: 0, card: 0, point: 0, other: 0 }
        };

        tickets.forEach(ticket => {
            const trip = tripMap.get(toKey(ticket.tripId));
            if (!trip) return;

            const baseDate = combineDateAndTime(trip.date, trip.time);
            if (!baseDate) return;

            const routeList = routeStopsByRoute.get(toKey(trip.routeId));
            if (!routeList || !routeList.length) return;

            let cumulativeSeconds = 0;
            let fromRouteStop = null;
            for (const rs of routeList) {
                cumulativeSeconds += parseDurationToSeconds(rs.duration);
                if (toKey(rs.stopId) === toKey(ticket.fromRouteStopId)) {
                    fromRouteStop = rs;
                    break;
                }
            }
            if (!fromRouteStop) return;

            const departure = new Date(baseDate.getTime() + cumulativeSeconds * 1000);
            if (departure < now) {
                return;
            }

            const fromStopTitle = stopMap.get(toKey(ticket.fromRouteStopId)) || "-";
            const toStopTitle = ticket.toRouteStopId ? (stopMap.get(toKey(ticket.toRouteStopId)) || "") : "";

            const user = ticket.userId ? userMap.get(toKey(ticket.userId)) : null;
            const branch = user?.branchId ? branchMap.get(toKey(user.branchId)) : null;

            const branchKey = branch ? toKey(branch.id) : "none";
            if (!branchBuckets.has(branchKey)) {
                branchBuckets.set(branchKey, {
                    id: branch?.id ?? null,
                    title: branch?.title || "Belirtilmemiş Şube",
                    users: new Map(),
                    totals: { count: 0, amount: 0, payments: { cash: 0, card: 0, point: 0, other: 0 } }
                });
            }
            const branchBucket = branchBuckets.get(branchKey);

            const userKey = user ? toKey(user.id) : `none-${branchKey}`;
            if (!branchBucket.users.has(userKey)) {
                branchBucket.users.set(userKey, {
                    id: user?.id ?? null,
                    name: user?.name || "Belirtilmemiş Kullanıcı",
                    tickets: [],
                    totals: { count: 0, amount: 0, payments: { cash: 0, card: 0, point: 0, other: 0 } }
                });
            }
            const userBucket = branchBucket.users.get(userKey);

            const price = Number(ticket.price) || 0;
            const paymentType = normalizePayment(ticket.payment);
            const label = paymentType === "other"
                ? (ticket.payment ? ticket.payment.toUpperCase() : "-")
                : paymentLabel(paymentType);

            userBucket.tickets.push({
                pnr: ticket.pnr || "-",
                departure,
                route: formatRouteTitle(fromStopTitle, toStopTitle),
                seat: ticket.seatNo !== undefined && ticket.seatNo !== null ? String(ticket.seatNo) : "-",
                payment: label,
                price
            });

            userBucket.totals.count += 1;
            userBucket.totals.amount += price;
            userBucket.totals.payments[paymentType] += price;

            branchBucket.totals.count += 1;
            branchBucket.totals.amount += price;
            branchBucket.totals.payments[paymentType] += price;

            totals.count += 1;
            totals.amount += price;
            totals.payments[paymentType] += price;
        });

        const preparedBranches = Array.from(branchBuckets.values()).map(branch => {
            const usersArray = Array.from(branch.users.values()).map(user => {
                user.tickets.sort((a, b) => a.departure - b.departure);
                return {
                    id: user.id,
                    name: user.name,
                    tickets: user.tickets,
                    totals: user.totals
                };
            }).sort((a, b) => a.name.localeCompare(b.name, "tr-TR"));

            return {
                id: branch.id,
                title: branch.title,
                users: usersArray,
                totals: branch.totals
            };
        }).sort((a, b) => a.title.localeCompare(b.title, "tr-TR"));

        const totalUsers = preparedBranches.reduce((acc, branch) => acc + branch.users.length, 0);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline; filename=\"upcoming_tickets.pdf\"");

        await generateUpcomingTicketsReport({
            generatedAt: now,
            branches: preparedBranches,
            totals,
            summary: {
                branchCount: preparedBranches.length,
                userCount: totalUsers
            }
        }, res);
    } catch (err) {
        console.error("getUpcomingTicketsReport error:", err);
        res.status(500).json({ message: "İleri tarihli satışlar raporu oluşturulamadı." });
    }
};

exports.postAnnouncementSeen = async (req, res, next) => {
    try {
        const { announcementId } = req.body;
        const userId = req.session.user.id;
        await req.models.AnnouncementUser.findOrCreate({
            where: { announcementId, userId },
            defaults: { seenAt: new Date() }
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Announcement seen error:", err);
        res.status(500).json({ message: err.message });
    }
};
