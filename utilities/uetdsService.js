const soap = require("soap");
const moment = require("moment");

const UETDS_ENDPOINTS = {
    test: "https://servis.turkiye.gov.tr/services/g2g/kdgm/test/uetdsarizi?wsdl",
    prod: "https://servis.turkiye.gov.tr/services/g2g/kdgm/uetdsarizi?wsdl"
};

/**
 * Firma bilgilerini getirir
 */
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

function timeStringToSeconds(timeString) {
    if (!timeString) {
        return 0;
    }

    if (typeof timeString === "number" && Number.isFinite(timeString)) {
        return Math.max(0, Math.floor(timeString));
    }

    if (timeString instanceof Date) {
        return (
            (timeString.getUTCHours?.() || 0) * 3600 +
            (timeString.getUTCMinutes?.() || 0) * 60 +
            (timeString.getUTCSeconds?.() || 0)
        );
    }

    if (typeof timeString !== "string") {
        return 0;
    }

    const trimmed = timeString.trim();
    if (!trimmed) {
        return 0;
    }

    const parts = trimmed.split(":").map((part) => Number(part) || 0);
    const [hours = 0, minutes = 0, seconds = 0] = parts.length === 2
        ? [parts[0], parts[1], 0]
        : [parts[0], parts[1], parts[2] || 0];

    return (hours * 3600) + (minutes * 60) + seconds;
}

function computeTripEndDateTime(hareketTarihi, hareketSaati, routeStops = [], stopTimes = []) {
    const orderedRouteStops = [...routeStops].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    if (!orderedRouteStops.length) {
        return null;
    }

    if (!moment(hareketTarihi, "YYYY-MM-DD", true).isValid()) {
        return null;
    }

    const hareketDateTime = moment(`${hareketTarihi} ${hareketSaati}`, ["YYYY-MM-DD HH:mm", "YYYY-MM-DD HH:mm:ss"], true);
    const baseDateTime = hareketDateTime.isValid()
        ? hareketDateTime
        : moment(`${hareketTarihi} ${hareketSaati || "00:00"}`, ["YYYY-MM-DD HH:mm", "YYYY-MM-DD HH:mm:ss"], true);

    if (!baseDateTime.isValid()) {
        return null;
    }

    const offsetMap = new Map(stopTimes.map((row) => {
        const routeStopId = Number(row.routeStopId);
        const offsetMinutes = Number(row.offsetMinutes) || 0;
        return [routeStopId, offsetMinutes];
    }));

    const totalDurationSeconds = orderedRouteStops.reduce((acc, routeStop) => acc + timeStringToSeconds(routeStop.duration), 0);
    const totalOffsetSeconds = orderedRouteStops.reduce((acc, routeStop) => acc + ((offsetMap.get(Number(routeStop.id)) || 0) * 60), 0);

    return baseDateTime.clone().add(totalDurationSeconds + totalOffsetSeconds, "seconds");
}

/**
 * 🚍 UETDS seferEkle
 * tripId’ye göre DB’den sefer bilgilerini alır ve SOAP isteği gönderir
 */
async function seferEkle(req, tripId) {
    try {
        // Firma bilgileri
        const { wsdl, username, password, plaka } = await getFirmCredentials(req);

        // Trip bilgileri
        const trip = await req.models.Trip.findOne({
            where: { id: tripId },
            include: [
                {
                    model: req.models.Route, as: "route", include: [
                        { model: req.models.Stop, as: "fromStop", attributes: ["title"] },
                        { model: req.models.Stop, as: "toStop", attributes: ["title"] }
                    ]
                },
                { model: req.models.Bus, as: "bus", attributes: ["licensePlate", "phoneNumber"] }
            ]
        });

        if (!trip) throw new Error(`Trip bulunamadı: ${tripId}`);

        const hareketTarihi = moment(trip.date).format("YYYY-MM-DD");
        const hareketSaati = trip.time || "00:00";
        let seferBitisTarihi = moment(trip.date).format("YYYY-MM-DD");
        let seferBitisSaati = trip.estimatedArrivalTime || "00:00";

        const [routeStops, stopTimes] = trip.routeId
            ? await Promise.all([
                req.models.RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] }),
                req.models.TripStopTime.findAll({ where: { tripId: trip.id } })
            ])
            : [[], []];

        const computedEndDate = computeTripEndDateTime(hareketTarihi, hareketSaati, routeStops, stopTimes);
        if (computedEndDate) {
            seferBitisTarihi = computedEndDate.format("YYYY-MM-DD");
            seferBitisSaati = computedEndDate.format("HH:mm");
        }

        const args = {
            wsuser: {
                kullaniciAdi: username,
                sifre: password
            },
            ariziSeferBilgileriInput: {
                aracPlaka: plaka || trip.bus?.licensePlate,
                seferAciklama: `${trip.route?.fromStop?.title || ""} - ${trip.route?.toStop?.title || ""}`,
                hareketTarihi: `${hareketTarihi}`,
                hareketSaati: hareketSaati,
                aracTelefonu: trip.bus?.phoneNumber || "5554443322",
                firmaSeferNo: `TRIP-${trip.id}`,
                seferBitisTarihi: `${seferBitisTarihi}`,
                seferBitisSaati: seferBitisSaati
            }
        };

        console.log("🚍 [UETDS] seferEkle isteği:", args);

        // SOAP client
        const client = await soap.createClientAsync(wsdl);
        client.setSecurity(new soap.BasicAuthSecurity(username, password));

        const [result, rawResponse] = await client.seferEkleAsync(args);

        console.log("✅ [UETDS] seferEkle yanıtı:", result);

        // Başarılıysa Trip modeline UETDS referans numarasını kaydedebilirsin
        if (result?.return?.uetdsSeferReferansNo) {
            trip.uetdsRefNo = result.return.uetdsSeferReferansNo;
            await trip.save();
        }

        return result.return;
    } catch (err) {
        console.error("❌ [UETDS] seferEkle Hatası:", err.message || err);
        throw err;
    }
}

module.exports = { seferEkle };
