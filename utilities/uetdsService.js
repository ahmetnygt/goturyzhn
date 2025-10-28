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
    if (!timeString) return 0;

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

    if (typeof timeString !== "string") return 0;

    const trimmed = timeString.trim();
    if (!trimmed) return 0;

    const parts = trimmed.split(":").map((part) => Number(part) || 0);
    const [hours = 0, minutes = 0, seconds = 0] = parts.length === 2
        ? [parts[0], parts[1], 0]
        : [parts[0], parts[1], parts[2] || 0];

    return (hours * 3600) + (minutes * 60) + seconds;
}

function computeTripEndDateTime(hareketTarihi, hareketSaati, routeStops = [], stopTimes = []) {
    const orderedRouteStops = [...routeStops].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    if (!orderedRouteStops.length) return null;

    if (!moment(hareketTarihi, "YYYY-MM-DD", true).isValid()) return null;

    const hareketDateTime = moment(`${hareketTarihi} ${hareketSaati}`, ["YYYY-MM-DD HH:mm", "YYYY-MM-DD HH:mm:ss"], true);
    const baseDateTime = hareketDateTime.isValid()
        ? hareketDateTime
        : moment(`${hareketTarihi} ${hareketSaati || "00:00"}`, ["YYYY-MM-DD HH:mm", "YYYY-MM-DD HH:mm:ss"], true);

    if (!baseDateTime.isValid()) return null;

    const offsetMap = new Map(stopTimes.map((row) => {
        const routeStopId = Number(row.routeStopId);
        const offsetMinutes = Number(row.offsetMinutes) || 0;
        return [routeStopId, offsetMinutes];
    }));

    const totalDurationSeconds = orderedRouteStops.reduce((acc, routeStop) => acc + timeStringToSeconds(routeStop.duration), 0);
    const totalOffsetSeconds = orderedRouteStops.reduce((acc, routeStop) => acc + ((offsetMap.get(Number(routeStop.id)) || 0) * 60), 0);

    return baseDateTime.clone().add(totalDurationSeconds + totalOffsetSeconds, "seconds");
}

// görev -> turKodu
function mapDutyToTurKodu(duty) {
    switch (duty) {
        case "driver": return 1;     // Sürücü
        case "assistant": return 2;  // Muavin
        case "hostess": return 3;    // Host/Hostes
        default: return 0;
    }
}

// cinsiyet -> UETDS formatı
function mapGender(g) {
    return g === "m" ? "E" : "K";
}

// ufak temizlikler
function cleanPhone(p) {
    if (!p) return "";
    return String(p).replace(/\s+/g, "").replace(/^90/, "0");
}

async function seferEkle(req, tripId) {
    try {
        const { wsdl, username, password, plaka } = await getFirmCredentials(req);

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

        // 🔧 Saniyeyi her durumda at
        const hareketSaati = moment(trip.time, ["HH:mm", "HH:mm:ss"]).format("HH:mm");

        let seferBitisTarihi = moment(trip.date).format("YYYY-MM-DD");
        let seferBitisSaati = moment(trip.estimatedArrivalTime || "00:00", ["HH:mm", "HH:mm:ss"]).format("HH:mm");

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
                hareketTarihi,
                hareketSaati,
                aracTelefonu: trip.bus?.phoneNumber || "5554443322",
                firmaSeferNo: `TRIP-${trip.id}`,
                seferBitisTarihi,
                seferBitisSaati
            }
        };

        console.log("🚍 [UETDS] seferEkle isteği:", args);

        const client = await soap.createClientAsync(wsdl);
        client.setSecurity(new soap.BasicAuthSecurity(username, password));

        const [result] = await client.seferEkleAsync(args);

        console.log("✅ [UETDS] seferEkle yanıtı:", result);

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

async function seferGuncelle(req, tripId, override = {}) {
    try {
        // Firma bilgileri
        const { wsdl, username, password, plaka } = await getFirmCredentials(req);

        // Trip bilgilerini al
        const trip = await req.models.Trip.findOne({
            where: { id: tripId },
            include: [
                {
                    model: req.models.Route,
                    as: "route",
                    include: [
                        { model: req.models.Stop, as: "fromStop", attributes: ["title"] },
                        { model: req.models.Stop, as: "toStop", attributes: ["title"] }
                    ]
                },
                { model: req.models.Bus, as: "bus", attributes: ["licensePlate", "phoneNumber"] }
            ]
        });

        if (!trip) throw new Error(`Trip bulunamadı: ${tripId}`);

        const referansNo = override.referansNo || trip.uetdsRefNo;
        if (!referansNo) throw new Error("UETDS referans numarası bulunamadı, sefer güncellenemez.");

        const hareketTarihi = moment(trip.date).format("YYYY-MM-DD");
        const hareketSaati = moment(trip.time, ["HH:mm", "HH:mm:ss"]).format("HH:mm");

        const [routeStops, stopTimes] = trip.routeId
            ? await Promise.all([
                req.models.RouteStop.findAll({ where: { routeId: trip.routeId }, order: [["order", "ASC"]] }),
                req.models.TripStopTime.findAll({ where: { tripId: trip.id } })
            ])
            : [[], []];

        // Bitiş tarihi hesapla
        const computedEnd = computeTripEndDateTime(hareketTarihi, hareketSaati, routeStops, stopTimes);
        const seferBitisTarihi = (computedEnd || moment(trip.date)).format("YYYY-MM-DD");
        const seferBitisSaati = (computedEnd || moment(trip.date)).format("HH:mm");

        // Güncellenen değerler (override varsa onları kullan)
        const finalData = {
            aracPlaka: override.plaka || plaka || trip.bus?.licensePlate || "",
            seferAciklama: override.seferAciklama || `${trip.route?.fromStop?.title || ""} - ${trip.route?.toStop?.title || ""}`,
            hareketTarihi: moment(override.hareketTarihi || hareketTarihi).format("YYYY-MM-DD[T]HH:mm:ss"),
            hareketSaati: moment(override.hareketSaati || hareketSaati, ["HH:mm", "HH:mm:ss"]).format("HH:mm"),
            aracTelefonu: override.aracTelefonu || trip.bus?.phoneNumber || "5554443322",
            firmaSeferNo: override.firmaSeferNo || `TRIP-${trip.id}`,
            seferBitisTarihi: moment(override.seferBitisTarihi || seferBitisTarihi).format("YYYY-MM-DD[T]HH:mm:ss"),
            seferBitisSaati: moment(override.seferBitisSaati || seferBitisSaati, ["HH:mm", "HH:mm:ss"]).format("HH:mm")
        };

        const args = {
            wsuser: {
                kullaniciAdi: username,
                sifre: password,
                targetNSAlias: "tns",
                targetNamespace: "http://uetds.unetws.udhb.gov.tr/"
            },
            guncellenecekSeferReferansNo: Number(referansNo),
            ariziSeferBilgileriInput: {
                ...finalData,
                targetNSAlias: "tns",
                targetNamespace: "http://uetds.unetws.udhb.gov.tr/"
            },
            targetNSAlias: "tns",
            targetNamespace: "http://uetds.unetws.udhb.gov.tr/"
        };

        console.log("🧩 [UETDS] seferGuncelle isteği:", args);

        const client = await soap.createClientAsync(wsdl);
        client.setSecurity(new soap.BasicAuthSecurity(username, password));

        const [result] = await client.seferGuncelleAsync(args);

        console.log("✅ [UETDS] seferGuncelle yanıtı:", result);

        const { sonucKodu, sonucMesaji, uetdsSeferReferansNo } = result?.return || {};

        return {
            success: sonucKodu === 1,
            code: sonucKodu,
            message: sonucMesaji,
            refNo: uetdsSeferReferansNo || referansNo
        };
    } catch (err) {
        console.error("❌ [UETDS] seferGuncelle hatası:", err.message || err);
        return {
            success: false,
            error: err.message || err
        };
    }
}

async function seferIptal(req, tripId) {
    try {
        const { wsdl, username, password } = await getFirmCredentials(req);

        // Trip kontrolü
        const trip = await req.models.Trip.findByPk(tripId);
        if (!trip || !trip.uetdsRefNo) {
            throw new Error("Geçerli UETDS referans numarası bulunamadı.");
        }

        const args = {
            wsuser: {
                kullaniciAdi: username,
                sifre: password,
            },
            uetdsSeferReferansNo: trip.uetdsRefNo,
            iptalAciklama: "Sefer iptal edilmiştir.",
        };

        console.log("🟥 [UETDS] seferIptal isteği:", args);

        const client = await soap.createClientAsync(wsdl);
        client.setSecurity(new soap.BasicAuthSecurity(username, password));

        const [result] = await client.seferIptalAsync(args);

        console.log("✅ [UETDS] seferIptal yanıtı:", result);

        if (result?.return?.sonucKodu === 0) {
            console.log(`🧾 Sefer ${trip.uetdsRefNo} başarıyla iptal edildi.`);
        } else {
            console.warn(`⚠️ seferIptal başarısız: ${result?.return?.sonucMesaji}`);
        }

        return result.return;
    } catch (err) {
        console.error("❌ [UETDS] seferIptal Hatası:", err.message || err);
        throw err;
    }
}

async function seferAktif(req, tripId) {
    try {
        const { wsdl, username, password } = await getFirmCredentials(req);
        const trip = await req.models.Trip.findByPk(tripId);
        if (!trip || !trip.uetdsRefNo) throw new Error("Geçerli UETDS referans numarası bulunamadı.");

        const args = {
            wsuser: { kullaniciAdi: username, sifre: password },
            uetdsSeferReferansNo: trip.uetdsRefNo,
        };

        console.log("🟢 [UETDS] seferAktif isteği:", args);

        const client = await soap.createClientAsync(wsdl);
        client.setSecurity(new soap.BasicAuthSecurity(username, password));

        const [result] = await client.seferAktifAsync(args);
        console.log("✅ [UETDS] seferAktif yanıtı:", result);

        return result.return;
    } catch (err) {
        console.error("❌ [UETDS] seferAktif hatası:", err.message || err);
        throw err;
    }
}

async function seferPlakaDegistir(req, tripId, yeniPlaka) {
    try {
        const { wsdl, username, password } = await getFirmCredentials(req);

        const trip = await req.models.Trip.findByPk(tripId);
        if (!trip || !trip.uetdsRefNo) {
            throw new Error("Geçerli UETDS referans numarası bulunamadı.");
        }

        if (!yeniPlaka) throw new Error("Yeni plaka bilgisi bulunamadı.");

        // Boşlukları temizle (ör. "17 AES 768" -> "17AES768")
        const cleanedPlaka = yeniPlaka.replace(/\s+/g, "");

        const args = {
            wsuser: {
                kullaniciAdi: username,
                sifre: password,
            },
            uetdsSeferReferansNo: trip.uetdsRefNo,
            yeniAracPlaka: cleanedPlaka,
        };

        console.log("🚍 [UETDS] seferPlakaDegistir isteği:", args);

        const client = await soap.createClientAsync(wsdl);
        client.setSecurity(new soap.BasicAuthSecurity(username, password));

        const [result] = await client.seferPlakaDegistirAsync(args);
        console.log("✅ [UETDS] seferPlakaDegistir yanıtı:", result);

        return result.return;
    } catch (err) {
        console.error("❌ [UETDS] seferPlakaDegistir hatası:", err.message || err);
        throw err;
    }
}

async function personelEkle(req, tripId, staffRow) {
    const { wsdl, username, password } = await getFirmCredentials(req);

    const trip = await req.models.Trip.findByPk(tripId);
    if (!trip || !trip.uetdsRefNo)
        throw new Error("UETDS referans numarası bulunamadı.");
    if (!staffRow || !staffRow.idNumber)
        throw new Error("Geçersiz personel kaydı.");

    const args = {
        wsuser: {
            kullaniciAdi: username,
            sifre: password,
            targetNSAlias: "tns",
            targetNamespace: "http://uetds.unetws.udhb.gov.tr/",
        },
        uetdsSeferReferansNo: trip.uetdsRefNo,
        seferPersonelBilgileriInput: {
            turKodu: mapDutyToTurKodu(staffRow.duty),
            uyrukUlke: (staffRow.nationality || "TR").toUpperCase(),
            tcKimlikPasaportNo: String(staffRow.idNumber),
            cinsiyet: mapGender(staffRow.gender),
            adi: staffRow.name,
            soyadi: staffRow.surname,
            telefon: cleanPhone(staffRow.phoneNumber),
            adres: staffRow.address || "",
            hesKodu: "",
            targetNSAlias: "tns",
            targetNamespace: "http://uetds.unetws.udhb.gov.tr/",
        },
        targetNSAlias: "tns",
        targetNamespace: "http://uetds.unetws.udhb.gov.tr/",
    };

    console.log("🟩 [UETDS] personelEkle isteği →", {
        tripId,
        refNo: trip.uetdsRefNo,
        personel: `${staffRow.name} ${staffRow.surname}`,
        idNumber: staffRow.idNumber,
    });

    const client = await soap.createClientAsync(wsdl);
    client.setSecurity(new soap.BasicAuthSecurity(username, password));

    const [result] = await client.personelEkleAsync(args);
    const response = result?.return ?? result;

    console.log("✅ [UETDS] personelEkle yanıtı →", response);
    return response;
}

async function personelIptal(req, tripId, staffRow, iptalAciklama = "Personel kaldırıldı") {
    const { wsdl, username, password } = await getFirmCredentials(req);

    const trip = await req.models.Trip.findByPk(tripId);
    if (!trip || !trip.uetdsRefNo)
        throw new Error("UETDS referans numarası bulunamadı.");
    if (!staffRow || !staffRow.idNumber)
        throw new Error("Geçersiz personel kaydı.");

    const args = {
        wsuser: {
            kullaniciAdi: username,
            sifre: password,
            targetNSAlias: "tns",
            targetNamespace: "http://uetds.unetws.udhb.gov.tr/",
        },
        iptalPersonelInput: {
            personelTCKimlikPasaportNo: String(staffRow.idNumber),
            iptalAciklama,
            uetdsSeferReferansNo: trip.uetdsRefNo,
            targetNSAlias: "tns",
            targetNamespace: "http://uetds.unetws.udhb.gov.tr/",
        },
        targetNSAlias: "tns",
        targetNamespace: "http://uetds.unetws.udhb.gov.tr/",
    };

    console.log("🟥 [UETDS] personelIptal isteği →", {
        tripId,
        refNo: trip.uetdsRefNo,
        personel: `${staffRow.name} ${staffRow.surname}`,
        idNumber: staffRow.idNumber,
        iptalAciklama,
    });

    const client = await soap.createClientAsync(wsdl);
    client.setSecurity(new soap.BasicAuthSecurity(username, password));

    const [result] = await client.personelIptalAsync(args);
    const response = result?.return ?? result;

    console.log("✅ [UETDS] personelIptal yanıtı →", response);
    return response;
}

module.exports = { seferEkle, seferGuncelle, seferIptal, seferAktif, seferPlakaDegistir, personelEkle, personelIptal };