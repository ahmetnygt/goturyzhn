const soap = require("soap");
const moment = require("moment");

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

    const params = {
        UetdsYtsUser: { kullaniciAdi, sifre },
        uetdsAriziSeferBilgileriInput: {
            aracPlaka: trip.bus?.licensePlate,
            hareketTarihi: moment(trip.date).format("YYYY-MM-DD"),
            hareketSaati: trip.time,
            seferAciklama: trip.description || "Götür ERP sefer bildirimi",
            firmaSeferNo: trip.id.toString(),
            seferBitisTarihi: moment(trip.date).format("YYYY-MM-DD"),
            seferBitisSaati: trip.endTime || trip.time,
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

    const params = {
        UetdsYtsUser: { kullaniciAdi, sifre },
        guncellenecekSeferReferansNo: referansNo,
        uetdsAriziSeferBilgileriInput: {
            aracPlaka: trip.bus?.licensePlate,
            hareketTarihi: moment(trip.date).format("YYYY-MM-DD"),
            hareketSaati: trip.time,
            seferAciklama: trip.description || "",
            seferBitisTarihi: moment(trip.date).format("YYYY-MM-DD"),
            seferBitisSaati: trip.endTime || trip.time,
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
    const ticket = await req.models.Ticket.findByPk(ticketId);
    if (!ticket) throw new Error("Yolcu bileti bulunamadı.");

    const client = await getSoapClient(isTest);

    const params = {
        UetdsYtsUser: { kullaniciAdi, sifre },
        uetdsSeferReferansNo: referansNo,
        yolcuBilgileriInput: {
            adi: ticket.name,
            soyadi: ticket.surname,
            cinsiyet: ticket.gender === "m" ? "E" : "K",
            tckn: ticket.idNumber,
            koltukNo: String(ticket.seatNo),
            nereden: ticket.fromRouteStopId,
            nereye: ticket.toRouteStopId,
        },
    };

    const result = await client.yolcuEkleAsync(params);
    return result?.[0];
};