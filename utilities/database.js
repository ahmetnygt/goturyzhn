const { Sequelize } = require("sequelize");
const initModels = require("./initModels");
const bcrypt = require("bcrypt");

const connections = {};

async function getTenantConnection(subdomain) {
  if (connections[subdomain]) {
    return connections[subdomain];
  }

  // subdomain = database adı
  const sequelize = new Sequelize(
    subdomain,
    "doadmin",
    "AVNS_rfP7FS1Hdg-KSHpn02u",
    {
      host: "dbaas-db-5929049-do-user-22627641-0.g.db.ondigitalocean.com",
      port: 25060,
      dialect: "mysql",
      logging: false,
    }
  );

  const models = initModels(sequelize);

  // tabloları oluştur
  await sequelize.sync({ alter: true });

  // default kullanıcı ekle
  if (models.FirmUser) {
    const count = await models.FirmUser.count();
    if (count === 0) {
      const hashedPassword = await bcrypt.hash("anadolutat1071", 10);
      await models.FirmUser.create({
        branchId: 0,
        username: "GOTUR",
        password: hashedPassword,
        name: "Götür Sistem Kullanıcısı",
        phoneNumber: "0850 840 1915",
      });
      console.log(`[${subdomain}] için default kullanıcı eklendi.`);
    }
  }

  if (models.Permission) {
    const count = await models.Permission.count();

    if (count === 0) {
      const permissionsSeedData = [
        { id: 1, code: 'REGISTER_RECORD_MANAGE', module: 'register', description: 'Gelir gider kaydı girer, siler ve düzenler', isActive: true, createdAt: parseDate('2025-08-29 14:56:53'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 2, code: 'REGISTER_TRANSFER', module: 'register', description: 'Kasasını başkasına devredebilir', isActive: true, createdAt: parseDate('2025-08-29 14:56:53'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 3, code: 'REGISTER_RESET', module: 'register', description: 'Kasasını sıfırlayabilir', isActive: true, createdAt: parseDate('2025-08-29 14:56:53'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 4, code: 'REGISTER_USER_PAYMENT', module: 'register', description: 'Başka kullanıcıya ödeme yapabilir ve alabilir', isActive: true, createdAt: parseDate('2025-08-29 14:56:53'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 5, code: 'REGISTER_VIEW_OTHERS', module: 'register', description: 'Diğer kasaları görüntüleyebilir', isActive: true, createdAt: parseDate('2025-08-29 14:56:53'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 6, code: 'TRIP_BUS_ASSIGN', module: 'trip', description: 'Seferin otobüsünü belirleyebilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 7, code: 'TRIP_PAST_VIEW', module: 'trip', description: 'Geçmiş seferleri görebilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 8, code: 'TRIP_FINANCIAL_DETAILS_VIEW', module: 'trip', description: 'Sefer gelir ve gider detaylarını görebilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 9, code: 'TRIP_STAFF_ASSIGN', module: 'trip', description: 'Sefere personel atayabilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 10, code: 'TRIP_OPERATIONS_VIEW', module: 'trip', description: 'Sefer işlemlerini görüntüleyebilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 12, code: 'TRIP_CANCELLED_VIEW', module: 'trip', description: 'İptal seferleri görebilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 13, code: 'TRIP_PASSENGERS_TRANSFER', module: 'trip', description: 'Tüm yolcuları toplu transfer edebilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 14, code: 'TRIP_OTHERS_NOTES_MANAGE', module: 'trip', description: 'Seferde başkalarının notlarını silebilir ve günceller', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 15, code: 'TRIP_PASSENGERS_SMS_SEND', module: 'trip', description: 'Seferdeki yolculara sms gönderimi yapabilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 16, code: 'TRIP_CANCEL', module: 'trip', description: 'Sefer iptal edebilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 17, code: 'TRIP_STOP_RESTRICT', module: 'trip', description: 'Durak kısıtlaması yapabilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 18, code: 'TRIP_BLACKLIST_MANAGE', module: 'trip', description: 'Yolcuyu kara listeye alabilir ve çıkarabilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 19, code: 'TRIP_SEAT_MODEL_CHANGE', module: 'trip', description: 'Seferin koltuk modelini değiştirebilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 20, code: 'TRIP_NOTES_MANAGE', module: 'trip', description: 'Sefere not ekleme, güncelleme ve silme işlemi yapabilir', isActive: true, createdAt: parseDate('2025-08-29 17:18:42'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 22, code: 'UPDATE_RESERVATION_OPTION_TIME', module: 'sales', description: 'Rezervasyon opsiyon süresini değiştirebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 23, code: 'UPDATE_RESERVATION_OPTION_TIME_OTHER_BRANCH', module: 'sales', description: 'Başka şubede opsiyon süresini değiştirebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 24, code: 'UPDATE_OTHER_BRANCH_RESERVATION_OWN_BRANCH', module: 'sales', description: 'Kendi şubesinde başka şubelerin rezervasyonlarını güncelleyebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 25, code: 'UPDATE_OTHER_BRANCH_RESERVATION_OTHER_BRANCH', module: 'sales', description: 'Başka şubede başka şubelerin rezervasyonlarını güncelleyebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 26, code: 'SALE_CREATE_OWN_BRANCH', module: 'sales', description: 'Kendi şubesinde satış yapabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 27, code: 'SALE_CREATE_OTHER_BRANCH', module: 'sales', description: 'Başka şubede satış yapabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 28, code: 'SALE_DISCOUNT_TICKET_OWN_BRANCH', module: 'sales', description: 'Kendi şubesinde engelli, öğrenci, çocuk ve emekli bileti satabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 29, code: 'SALE_DISCOUNT_TICKET_OTHER_BRANCH', module: 'sales', description: 'Başka şubede engelli, öğrenci, çocuk ve emekli bileti satabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 30, code: 'OPEN_TICKET_SALE', module: 'sales', description: 'Açık bilet satabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 31, code: 'OPEN_TICKET_REFUND', module: 'sales', description: 'Açık bilet iade edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 32, code: 'REFUND_OTHER_BRANCH_SALES_OWN_BRANCH', module: 'sales', description: 'Kendi şubesinde başka şubelerin satışlarını iade edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 33, code: 'REFUND_OTHER_BRANCH_SALES_OTHER_BRANCH', module: 'sales', description: 'Başka şubede başka şubelerin satışlarını iade edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 34, code: 'PAST_TRIP_RESERVATION', module: 'sales', description: 'Opsiyon süresi geçmiş sefere rezervasyon yapabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 35, code: 'SALE_WITH_COLLECTING_BRANCH', module: 'sales', description: 'Tahsil eden şube girerek satış yapabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 36, code: 'OPEN_TICKET_ASSIGN_TRIP', module: 'sales', description: 'Açık bileti sefere bağlayabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 37, code: 'ENTER_FREE_PRICE', module: 'sales', description: 'Serbest fiyat girebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 38, code: 'TRANSFER_IN_OWN_BRANCH', module: 'sales', description: 'Kendi şubeye transfer yapabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 39, code: 'TRANSFER_IN_OTHER_BRANCH', module: 'sales', description: 'Başka şubeye transfer yapabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 41, code: 'LAST_MINUTE_TICKET_SALE', module: 'sales', description: 'Son dakika bileti satabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 42, code: 'SUBSCRIPTION_TICKET_SALE', module: 'sales', description: 'Aboneye satış yapabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 43, code: 'POINT_SALE', module: 'sales', description: 'Puanla satış yapabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 44, code: 'INTERNET_TICKET_EDIT', module: 'sales', description: 'İnternet biletlerini düzenleyebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 45, code: 'SEAT_BLOCK', module: 'sales', description: 'Koltuk bloke edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 46, code: 'SALE_WITH_DISCOUNT_CODE', module: 'sales', description: 'İndirim kodu ile satış yapabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 47, code: 'LAST_MINUTE_RESERVATION', module: 'sales', description: 'Son dakika rezervasyon', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 48, code: 'CANCEL_OTHER_BRANCH_RESERVATION_OWN_BRANCH', module: 'sales', description: 'Kendi şubesinde başka şubenin rezervasyonunu iptal edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 49, code: 'CANCEL_OTHER_BRANCH_RESERVATION_OTHER_BRANCH', module: 'sales', description: 'Başka şubede başka şubenin rezervasyonunu iptal edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 50, code: 'REFUND_OWN_BRANCH_SALES_OWN_BRANCH', module: 'sales', description: 'Kendi şubesinde kendi şubesinin satışlarını iade edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 51, code: 'REFUND_OWN_BRANCH_SALES_OTHER_BRANCH', module: 'sales', description: 'Başka şubede kendi şubesinin satışlarını iade edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 52, code: 'FOREIGN_PASSENGER_TICKET_SALE', module: 'sales', description: 'Yabancı uyruklu yolcuya bilet satabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 53, code: 'EDIT_OTHER_BRANCH_SALES', module: 'sales', description: 'Başka şubenin satışlarını düzeltebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 54, code: 'SALE_WITH_COLLECTING_BRANCH_LIMITED', module: 'sales', description: 'Tahsil eden şube girerek satış yaparken sadece kendi şubesine bağlı şubeler gözüksün', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 55, code: 'REFUND_EXPIRED_OPTION_TICKET', module: 'sales', description: 'İade opsiyon süresi geçmis olan biletleri iade edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 57, code: 'TRANSFER_EXPIRED_OPTION_TICKET', module: 'sales', description: 'İade opsiyon süresi geçmiş biletleri transfer edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 58, code: 'RELEASE_SEAT_LOCKS', module: 'sales', description: 'Koltuk kilitlerini kaldırabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 59, code: 'EDIT_OWN_BRANCH_SALES', module: 'sales', description: 'Kendi şubesinin satışlarını düzeltebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 60, code: 'ASSIGN_LOW_PRICE_OPEN_TICKET_TO_TRIP', module: 'sales', description: 'Düşük fiyatlı açık bileti sefere bağlayabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 61, code: 'EDIT_OTHER_BRANCH_SALES_IN_OWN_BRANCH', module: 'sales', description: 'Kendi şubesinde başka şubenin satışlarını düzeltebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 62, code: 'EDIT_OTHER_BRANCH_SALES_IN_OTHER_BRANCH', module: 'sales', description: 'Başka şubede başka şubenin satışlarını düzeltebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 63, code: 'CONVERT_OTHER_BRANCH_RESERVATION_TO_SALE_IN_OWN_BRANCH', module: 'sales', description: 'Kendi şubesinde başka şubelerin rezervasyonlarını satışa çevirebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 64, code: 'CONVERT_OTHER_BRANCH_RESERVATION_TO_SALE_IN_OTHER_BRANCH', module: 'sales', description: 'Başka şubede başka şubelerin rezervasyonlarını satışa çevirebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 65, code: 'WEB_TICKET_REFUND', module: 'sales', description: 'Web biletlerini iade edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 66, code: 'GOTUR_TICKET_REFUND', module: 'sales', description: 'Götür biletlerini iade edebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 67, code: 'OPEN_WEB_BRANCH_TICKETS', module: 'sales', description: 'Web şubelerinin biletlerini açığa alabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 68, code: 'FREE_RESERVATION', module: 'sales', description: 'Bedelsiz rezervasyon yapabilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 69, code: 'UPDATE_SALE_PASSENGER_INFO', module: 'sales', description: 'Bilet satıştan sonra yolcu telefon ve kimlik numarasını güncelleyebilir', isActive: true, createdAt: parseDate('2025-02-14 00:00:00'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 70, code: 'CUT_ACCOUNT', module: 'account_cut', description: 'Araç kaldırabilir', isActive: true, createdAt: parseDate('2025-09-05 16:17:02'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 71, code: 'REVERT_ACCOUNT_CUT', module: 'account_cut', description: 'Hesap kesimini geri alabilir', isActive: true, createdAt: parseDate('2025-09-05 16:17:02'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 72, code: 'PAY_DIFFERENT_FROM_BUS_EARNING', module: 'account_cut', description: 'Hesap keserken otobüse hakedişinden farklı ödeme yapabilir', isActive: true, createdAt: parseDate('2025-09-05 16:17:02'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 73, code: 'CUT_ACCOUNT_FOR_OTHER_BRANCH', module: 'account_cut', description: 'Başka şube adına hesap kesebilir', isActive: true, createdAt: parseDate('2025-09-05 16:17:02'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 74, code: 'PRINT_ACCOUNT_RECEIPT', module: 'account_cut', description: 'Hesap fişi yazdırabilir', isActive: true, createdAt: parseDate('2025-09-05 16:17:02'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 75, code: 'PRINT_PASSENGER_LIST_WITHOUT_CUT', module: 'account_cut', description: 'Hesap kesmeden yolcu listesi yazdırabilir', isActive: true, createdAt: parseDate('2025-09-05 16:17:02'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 76, code: 'PRINT_SEAT_PLAN_INVOICE_WITHOUT_CUT', module: 'account_cut', description: 'Hesap kesmeden Koltuk Planlı Fatura yazdırabilir', isActive: true, createdAt: parseDate('2025-09-05 16:17:02'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 77, code: 'CHANGE_COMMISSION_RATE_DURING_CUT', module: 'account_cut', description: 'Hesap keserken komisyon oranını değiştirebilir', isActive: true, createdAt: parseDate('2025-09-05 16:17:02'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 78, code: 'CHANGE_DEDUCTIONS_DURING_CUT', module: 'account_cut', description: 'Hesap keserken kesintileri değiştirebilir', isActive: true, createdAt: parseDate('2025-09-05 16:17:02'), updatedAt: parseDate('2025-08-29 17:18:42') },
        { id: 79, code: 'REVERT_ACCOUNT_CUT_FOR_OTHER_BRANCH', module: 'account_cut', description: 'Başka şube adına hesap kesimini geri alabilir', isActive: true, createdAt: parseDate('2025-09-05 16:17:02'), updatedAt: parseDate('2025-08-29 17:18:42') },
      ];
      await Permission.bulkCreate(permissionsSeedData);
      console.log('Default permissions were seeded.');
    }
  }

  connections[subdomain] = { sequelize, models };
  return connections[subdomain];
}

module.exports = { getTenantConnection };
