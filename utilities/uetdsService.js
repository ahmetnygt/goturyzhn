const soap = require("soap");
const moment = require("moment");

function mapGenderToUetdsCode(gender) {
    if (gender === "m") return "E"; // Erkek
    if (gender === "f") return "K"; // Kadın
    return "E";
}

function resolveStopCode(stop, fallback) {
    if (!stop) return fallback;
    if (stop.UETDS_code) return stop.UETDS_code.toString();
    if (stop.title) return stop.title;
    return fallback;
}

function toSeconds(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.floor(value);
    }

    if (value instanceof Date) {
        return (
            value.getHours() * 3600 +
            value.getMinutes() * 60 +
            value.getSeconds()
        );
    }

    if (typeof value !== "string") return null;

    const parts = value.trim().split(":").map(Number);
    if (!parts.length || parts.some((part) => Number.isNaN(part))) {
        return null;
    }

    const [hours = 0, minutes = 0, seconds = 0] = parts;
    return hours * 3600 + minutes * 60 + seconds;
}

function secondsToTimeString(totalSeconds) {
    if (totalSeconds === null || totalSeconds === undefined) return null;

    const normalized = ((Math.floor(totalSeconds) % 86400) + 86400) % 86400;
    const hours = Math.floor(normalized / 3600);
    const minutes = Math.floor((normalized % 3600) / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

async function computeTripEndDateTime(req, trip) {
    if (!trip || !trip.id || !trip.routeId || !trip.time || !trip.date) {
        return null;
    }

    const RouteStop = req.models?.RouteStop;
    const TripStopTime = req.models?.TripStopTime;

    if (!RouteStop || !TripStopTime) {
        return null;
    }

    const routeStops = await RouteStop.findAll({
        where: { routeId: trip.routeId },
        order: [["order", "ASC"]],
        raw: true,
    });

    if (!routeStops.length) {
        return null;
    }

    const stopOffsets = await TripStopTime.findAll({
        where: { tripId: trip.id },
        raw: true,
    });

    const offsetMap = new Map(
        stopOffsets.map((row) => [Number(row.routeStopId), Number(row.offsetMinutes) || 0])
    );

    const baseSeconds = toSeconds(trip.time);
    if (baseSeconds === null) {
        return null;
    }

    let cumulativeDuration = 0;
    let cumulativeOffsetSeconds = 0;

    for (const routeStop of routeStops) {
        const durationSeconds = toSeconds(routeStop.duration);
        if (durationSeconds !== null) {
            cumulativeDuration += durationSeconds;
        }

        const offsetMinutes = offsetMap.get(Number(routeStop.id)) || 0;
        cumulativeOffsetSeconds += Number(offsetMinutes) * 60;
    }

    const finalSeconds = baseSeconds + cumulativeDuration + cumulativeOffsetSeconds;
    const endTime = secondsToTimeString(finalSeconds);

    if (!endTime) {
        return null;
    }

    let endDate = null;
    if (trip.date) {
        const baseDate = moment(trip.date, "YYYY-MM-DD", true);
        if (baseDate.isValid()) {
            endDate = baseDate
                .clone()
                .add(Math.floor(finalSeconds / 86400), "days")
                .format("YYYY-MM-DD");
        } else {
            const fallbackDate = moment(trip.date);
            if (fallbackDate.isValid()) {
                endDate = fallbackDate
                    .clone()
                    .add(Math.floor(finalSeconds / 86400), "days")
                    .format("YYYY-MM-DD");
            }
        }
    }

    let fallbackDateString = null;
    if (trip.date) {
        const parsed = moment(trip.date);
        fallbackDateString = parsed.isValid()
            ? parsed.format("YYYY-MM-DD")
            : String(trip.date);
    }

    return {
        date: endDate || fallbackDateString,
        time: endTime,
    };
}

/**
 * Ortama göre doğru WSDL adresini döndürür
 */
function getWsdlUrl(isTest = false) {
    return isTest
        ? "https://servis.turkiye.gov.tr/services/g2g/kdgm/test/uetdsarizi?wsdl"
        : "https://servis.turkiye.gov.tr/services/g2g/kdgm/uetdsarizi?wsdl";
}

/**
 * Firma tablosundan tenant’a ait UETDS bilgilerini alır
 */
async function getFirmCredentials(req) {
    if (!req.commonModels?.Firm || !req.tenantKey)
        throw new Error("Firma bilgisi alınamadı (tenantKey eksik).");

    const firm = await req.commonModels.Firm.findOne({
        where: { key: req.tenantKey },
    });

    if (!firm)
        throw new Error(`Firma bulunamadı: ${req.tenantKey}`);

    if (!firm.uetdsUsername || !firm.uetdsPassword)
        throw new Error(`Firma (${req.tenantKey}) için UETDS kullanıcı adı/şifre tanımlı değil.`);

    return {
        kullaniciAdi: firm.uetdsUsername.trim(),
        sifre: firm.uetdsPassword.trim(),
        isTest: !!firm.isUetdsTestMode,
    };
}

/**
 * SOAP client oluşturur
 */
async function getSoapClient(isTest = false) {
    const url = getWsdlUrl(isTest);
    return soap.createClientAsync(url, { forceSoap12Headers: true });
}

/**
 * UETDS Servis Test
 */
exports.servisTest = async function (req) {
    const { isTest } = await getFirmCredentials(req);
    const client = await getSoapClient(isTest);
    const result = await client.servisTestAsync({ testMsj1: "GOTUR TEST" });
    return result?.[0];
};

/**
 * Sefer Ekle
 */
exports.seferEkle = async function (req, tripId) {
    const { kullaniciAdi, sifre, isTest } = await getFirmCredentials(req);
    const trip = await req.models.Trip.findByPk(tripId, {
        include: [
            { model: req.models.Bus, as: "bus" },
            { model: req.models.Route, as: "route" },
        ],
    });

    if (!trip) throw new Error("Sefer bulunamadı.");

    const client = await getSoapClient(isTest);

    const computedEnd = await computeTripEndDateTime(req, trip);

    const params = {
        UetdsYtsUser: { kullaniciAdi, sifre },
        uetdsAriziSeferBilgileriInput: {
            aracPlaka: trip.bus?.licensePlate,
            hareketTarihi: moment(trip.date).format("YYYY-MM-DD"),
            hareketSaati: trip.time,
            seferAciklama: trip.description || "Götür ERP sefer bildirimi",
            firmaSeferNo: trip.id.toString(),
            seferBitisTarihi: computedEnd?.date || moment(trip.date).format("YYYY-MM-DD"),
            seferBitisSaati: trip.endTime || computedEnd?.time || trip.time,
        },
    };

    const result = await client.seferEkleAsync(params);
    return result?.[0];
};

/**
 * Sefer Güncelle
 */
exports.seferGuncelle = async function (req, referansNo, tripId) {
    const { kullaniciAdi, sifre, isTest } = await getFirmCredentials(req);
    const trip = await req.models.Trip.findByPk(tripId, {
        include: [{ model: req.models.Bus, as: "bus" }],
    });
    if (!trip) throw new Error("Sefer bulunamadı.");

    const client = await getSoapClient(isTest);

    const computedEnd = await computeTripEndDateTime(req, trip);

    const params = {
        UetdsYtsUser: { kullaniciAdi, sifre },
        guncellenecekSeferReferansNo: referansNo,
        uetdsAriziSeferBilgileriInput: {
            aracPlaka: trip.bus?.licensePlate,
            hareketTarihi: moment(trip.date).format("YYYY-MM-DD"),
            hareketSaati: trip.time,
            seferAciklama: trip.description || "",
            seferBitisTarihi: computedEnd?.date || moment(trip.date).format("YYYY-MM-DD"),
            seferBitisSaati: trip.endTime || computedEnd?.time || trip.time,
        },
    };

    const result = await client.seferGuncelleAsync(params);
    return result?.[0];
};

/**
 * Sefer İptal
 */
exports.seferIptal = async function (req, referansNo, aciklama = "Sefer iptal edildi.") {
    const { kullaniciAdi, sifre, isTest } = await getFirmCredentials(req);
    const client = await getSoapClient(isTest);

    const params = {
        UetdsYtsUser: { kullaniciAdi, sifre },
        uetdsSeferReferansNo: referansNo,
        iptalAciklama: aciklama,
    };

    const result = await client.seferIptalAsync(params);
    return result?.[0];
};

/**
 * Personel Ekle
 */
exports.personelEkle = async function (req, referansNo, staffId) {
    const { kullaniciAdi, sifre, isTest } = await getFirmCredentials(req);
    const staff = await req.models.Staff.findByPk(staffId);
    if (!staff) throw new Error("Personel bulunamadı.");

    const client = await getSoapClient(isTest);

    const params = {
        UetdsYtsUser: { kullaniciAdi, sifre },
        uetdsSeferReferansNo: referansNo,
        seferPersonelBilgileriInput: {
            adi: staff.name,
            soyadi: staff.surname,
            gorevi: staff.duty || "SÜRÜCÜ",
            tckn: staff.identityNumber,
        },
    };

    const result = await client.personelEkleAsync(params);
    return result?.[0];
};

/**
 * Yolcu Ekle
 */
exports.yolcuEkle = async function (req, referansNo, ticketId) {
    const { kullaniciAdi, sifre, isTest } = await getFirmCredentials(req);
    const ticket = await req.models.Ticket.findByPk(ticketId, {
        include: [
            { model: req.models.Stop, as: "fromStop" },
            { model: req.models.Stop, as: "toStop" },
        ],
    });
    if (!ticket) throw new Error("Yolcu bileti bulunamadı.");

    const client = await getSoapClient(isTest);

    const params = {
        UetdsYtsUser: { kullaniciAdi, sifre },
        uetdsSeferReferansNo: referansNo,
        yolcuBilgileriInput: {
            adi: ticket.name?.trim(),
            soyadi: ticket.surname?.trim(),
            cinsiyet: mapGenderToUetdsCode(ticket.gender),
            tckn: ticket.idNumber?.trim(),
            koltukNo: ticket.seatNo ? String(ticket.seatNo) : undefined,
            nereden: resolveStopCode(ticket.fromStop, ticket.fromRouteStopId?.toString()),
            nereye: resolveStopCode(ticket.toStop, ticket.toRouteStopId?.toString()),
        },
    };

    const result = await client.yolcuEkleAsync(params);
    return result?.[0];
};