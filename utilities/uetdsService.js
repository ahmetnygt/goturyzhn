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
        const seferBitisTarihi = moment(trip.date).format("YYYY-MM-DD");
        const seferBitisSaati = trip.estimatedArrivalTime || "00:00";

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