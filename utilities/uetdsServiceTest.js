const soap = require("soap");
const publicIp = require("public-ip");

const WSDL_URL = "https://servis.turkiye.gov.tr/services/g2g/kdgm/test/uetdsarizi?wsdl";

(async () => {
    try {
        const client = await soap.createClientAsync(WSDL_URL);

        const username = "999999"; // <== test kullanıcı adın
        const password = "999999testtest"; // <== test şifren
        // HTTP Basic Auth ekle
        client.setSecurity(new soap.BasicAuthSecurity(username, password));

        const [result] = await client.servisTestAsync({ testMsj1: "Merhaba Götür" });
        console.log(result);
        const [res] = await client.kullaniciKontrolAsync({
            wsuser: username,
            wspass: password
        });
        console.log(result);

        // DB’den alacaksan burayı dinamik yapabilirsin
        // 1️⃣ IP adresini otomatik bul
        const ip = await publicIp.publicIpv4();
        console.log("🌐 IP adresin:", ip);

        // 3️⃣ Gönderilecek XML parametreleri
        const args = {
            wsuser: {
                kullaniciAdi: username,
                sifre: password
            },
            ipBaslangic: ip
        };

        // 4️⃣ Çağrıyı gönder
        // console.log("📤 UETDS ipTanimla isteği gönderiliyor...");
        // const [resulttt,  soapHeader, rawRequest] = await client.ipTanimlaAsync(args);

        // // 5️⃣ Yanıtı yazdır
        // console.log("✅ UETDS ipTanimla sonucu:");
        // console.dir(resulttt, { depth: null });

        // 4️⃣ Sefer Ekle
        const [seferResult] = await client.seferEkleAsync({
            wsuser: {                   // ← dikkat: wsuser (UetdsYtsUser değil)
                kullaniciAdi: username,
                sifre: password
            },
            ariziSeferBilgileriInput: { // ← dikkat: küçük "a", ASCII "i", "ı" değil
                aracPlaka: "06TARIFESIZ123",
                seferAciklama: "Götür Bilet Test",
                hareketTarihi: "2025-10-27T09:00:00", // xs:dateTime formatında (Zorunlu)
                hareketSaati: "09:00",
                aracTelefonu: "5554443322",
                firmaSeferNo: "1734-01",
                seferBitisTarihi: "2025-10-27T13:00:00", // xs:dateTime
                seferBitisSaati: "13:00"
            }
        });

        console.log("🚍 [UETDS] seferEkle yanıtı:");
        console.dir(seferResult, { depth: null });
    } catch (err) {
        console.error("❌ SOAP Hatası:", err);
    }
})();