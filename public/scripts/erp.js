let selectedSeats = []
let selectedTakenSeats = []
let currentTripDate;
let currentTripTime;
let currentTripPlaceTime;
let currentTripId;
let currentGroupId;
let currentPassengerRow;
let editingNoteId;
let currentStop = "1";
let currentStopStr = "Çanakkale İskele";
let selectedTicketStopId = currentStop;
let fromId;
let toId;
let fromStr;
let toStr;
let accountCutData;
let accountCutId;
let originalPrices = []
let seatTypes = []

let tripStaffInitial = {};
let tripStaffList = [];

let tripStopRestrictionChanges = {};
let tripStopRestrictionDirty = false;

let tripCargoStops = [];
const tripCargoListLoadingHtml = '<p class="text-center text-muted m-0 trip-cargo-list-placeholder">Kargolar yükleniyor...</p>';

function updateClock() {
    const clockElement = document.getElementById('clock');
    if (!clockElement) {
        return false;
    }

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    clockElement.textContent = `${hours}:${minutes}:${seconds}`;
    return true;
}

// İlk yüklemede çalıştır
const hasClock = updateClock();
// Her saniyede bir güncelle
if (hasClock) {
    setInterval(updateClock, 1000);
}

let loadingCount = 0;
const showLoading = () => {
    if (loadingCount === 0) $(".loading").css("display", "flex");
    loadingCount++;
};
const hideLoading = () => {
    loadingCount = Math.max(loadingCount - 1, 0);
    if (loadingCount === 0) $(".loading").css("display", "none");
};

const normalizeErpUrl = url => {
    if (typeof url !== "string" || !url.startsWith("/")) {
        return url;
    }

    let normalized = url.replace(/^\/erp(?=\/|\?|$)/, "");
    if (normalized === "") {
        return "/";
    }

    if (!normalized.startsWith("/")) {
        normalized = `/${normalized}`;
    }

    return normalized;
};

const showError = message => {
    const msg =
        typeof message === "string"
            ? message
            : message && message.message
                ? message.message
                : JSON.stringify(message);
    $(".error-popup .error-message").text(msg || "Bilinmeyen hata");
    $(".error-popup").css("display", "block");
};

window.showError = showError;

$(document).off("click", ".error-close").on("click", ".error-close", () => $(".error-popup").hide());

const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [input, init] = args;
    if (typeof input === "string") {
        input = normalizeErpUrl(input);
    } else if (typeof Request !== "undefined" && input instanceof Request) {
        input = new Request(normalizeErpUrl(input.url), input);
    }

    showLoading();
    try {
        const res = await originalFetch(input, init);
        if (!res.ok) {
            try {
                const clone = res.clone();
                let msg;
                try {
                    const data = await clone.json();
                    msg = data.message || data.error || JSON.stringify(data);
                } catch (_) {
                    msg = await clone.text();
                }
                showError(msg);
            } catch (e) {
                showError(e.message);
            }
        }
        return res;
    } catch (err) {
        showError(err.message || "Bilinmeyen hata");
        throw err;
    } finally {
        hideLoading();
    }
};

$(document).ajaxSend(showLoading);
$(document).ajaxComplete(hideLoading);
$(document).ajaxError(hideLoading)

$.ajaxPrefilter((options, originalOptions) => {
    if (options && typeof options.url === "string") {
        options.url = normalizeErpUrl(options.url);
    }

    if (originalOptions && typeof originalOptions.url === "string") {
        originalOptions.url = normalizeErpUrl(originalOptions.url);
    }
});

const originalWindowOpen = window.open;
window.open = (url, ...rest) => {
    if (typeof url === "string") {
        url = normalizeErpUrl(url);
    }

    return originalWindowOpen.call(window, url, ...rest);
};

window.permissions = [];
const hasPermission = code => window.permissions.includes(code);

function updateTakenTicketOpsVisibility($el) {
    $(".taken-ticket-op").css("display", "block");

    const status = $el.data("status");

    if (status == "reservation") {
        $(".taken-ticket-op[data-action='refund']").css("display", "none");
        $(".taken-ticket-op[data-action='open']").css("display", "none");
        $(".taken-ticket-op[data-action='delete_pending']").css("display", "none");
    }
    else if (status == "completed") {
        $(".taken-ticket-op[data-action='cancel']").css("display", "none");
        $(".taken-ticket-op[data-action='complete']").css("display", "none");
        $(".taken-ticket-op[data-action='delete_pending']").css("display", "none");
    }
    else if (status == "web" || status == "gotur") {
        $(".taken-ticket-op[data-action='cancel']").css("display", "none");
        $(".taken-ticket-op[data-action='complete']").css("display", "none");
        $(".taken-ticket-op[data-action='delete_pending']").css("display", "none");
    }
    else if (status == "pending") {
        $(".taken-ticket-op[data-action='complete']").css("display", "none");
        $(".taken-ticket-op[data-action='refund']").css("display", "none");
        $(".taken-ticket-op[data-action='open']").css("display", "none");
        $(".taken-ticket-op[data-action='move']").css("display", "none");
        $(".taken-ticket-op[data-action='edit']").css("display", "none");
        $(".taken-ticket-op[data-action='cancel']").css("display", "none");
    }

    if (!hasPermission("UPDATE_OTHER_BRANCH_RESERVATION_OWN_BRANCH") && $el.data("is-own-branch-ticket") == false && $el.data("is-own-branch-stop") == true && status == "reservation"
        ||
        !hasPermission("UPDATE_OTHER_BRANCH_RESERVATION_OTHER_BRANCH") && $el.data("is-own-branch-ticket") == false && $el.data("is-own-branch-stop") == false && status == "reservation"
        ||
        !hasPermission("EDIT_OTHER_BRANCH_SALES_IN_OWN_BRANCH") && $el.data("is-own-branch-ticket") == false && $el.data("is-own-branch-stop") == true && status == "completed"
        ||
        !hasPermission("EDIT_OTHER_BRANCH_SALES_IN_OTHER_BRANCH") && $el.data("is-own-branch-ticket") == false && $el.data("is-own-branch-stop") == false && status == "completed"
        ||
        !hasPermission("EDIT_OWN_BRANCH_SALES") && $el.data("is-own-branch-ticket") == true && status == "completed"
        ||
        !hasPermission("EDIT_OTHER_BRANCH_SALES") && $el.data("is-own-branch-ticket") == false && status == "completed"
        ||
        !hasPermission("INTERNET_TICKET_EDIT") && status == "web"
    ) {
        $(".taken-ticket-op[data-action='edit']").css("display", "none");
    }

    if (!hasPermission("CONVERT_OTHER_BRANCH_RESERVATION_TO_SALE_IN_OWN_BRANCH") && $el.data("is-own-branch-ticket") == false && $el.data("is-own-branch-stop") == true && status == "reservation"
        ||
        !hasPermission("CONVERT_OTHER_BRANCH_RESERVATION_TO_SALE_IN_OTHER_BRANCH") && $el.data("is-own-branch-ticket") == false && $el.data("is-own-branch-stop") == false && status == "reservation"
    ) {
        $(".taken-ticket-op[data-action='complete']").css("display", "none");
    }

    if (!hasPermission("REFUND_OWN_BRANCH_SALES_OWN_BRANCH") && $el.data("is-own-branch-ticket") == true && $el.data("is-own-branch-stop") == true
        ||
        !hasPermission("REFUND_OWN_BRANCH_SALES_OTHER_BRANCH") && $el.data("is-own-branch-ticket") == true && $el.data("is-own-branch-stop") == true
        ||
        !hasPermission("REFUND_OTHER_BRANCH_SALES_OTHER_BRANCH") && $el.data("is-own-branch-ticket") == false && $el.data("is-own-branch-stop") == false
        ||
        !hasPermission("REFUND_OTHER_BRANCH_SALES_OTHER_BRANCH") && $el.data("is-own-branch-ticket") == false && $el.data("is-own-branch-stop") == false
        ||
        !hasPermission("REFUND_EXPIRED_OPTION_TICKET") && new Date($el.data("refund-option").replace("Z", "")) < new Date()
        ||
        !hasPermission("WEB_TICKET_REFUND") && status == "web"
        ||
        !hasPermission("GOTUR_TICKET_REFUND") && status == "gotur"
    ) {
        $(".taken-ticket-op[data-action='refund']").css("display", "none");
    }

    if (!hasPermission("CANCEL_OTHER_BRANCH_RESERVATION_OWN_BRANCH") && $el.data("is-own-branch-ticket") == false && $el.data("is-own-branch-stop") == true
        ||
        !hasPermission("CANCEL_OTHER_BRANCH_RESERVATION_OTHER_BRANCH") && $el.data("is-own-branch-ticket") == false && $el.data("is-own-branch-stop") == false
    ) {
        $(".taken-ticket-op[data-action='cancel']").css("display", "none");
    }

    if (!hasPermission("OPEN_WEB_BRANCH_TICKETS") && (status == "web" || status == "gotur")
        ||
        !hasPermission("CANCEL_OTHER_BRANCH_RESERVATION_OTHER_BRANCH") && $el.data("is-own-branch-ticket") == false && $el.data("is-own-branch-stop") == false
    ) {
        $(".taken-ticket-op[data-action='cancel']").css("display", "none");
    }

    if (!hasPermission("TRANSFER_IN_OWN_BRANCH") && $el.data("is-own-branch-stop") == true
        ||
        !hasPermission("TRANSFER_IN_OTHER_BRANCH") && $el.data("is-own-branch-stop") == false
        ||
        !hasPermission("TRANSFER_EXPIRED_OPTION_TICKET") && new Date($el.data("refund-option").replace("Z", "")) < new Date()
    ) {
        $(".taken-ticket-op[data-action='move']").css("display", "none");
    }
}

function resetTripCargoForm() {
    $(".trip-cargo-sender-name").val("");
    $(".trip-cargo-sender-phone").val("");
    $(".trip-cargo-sender-identity").val("");
    $(".trip-cargo-description").val("");
    $(".trip-cargo-price").val("");
    $(".trip-cargo-payment").val("cash");
}

function updateTripCargoToOptions(defaultTo) {
    const $to = $(".trip-cargo-to");
    if (!$to.length) return;

    const placeholder = $("<option>")
        .val("")
        .text("Seçiniz")
        .prop("disabled", true);

    const selectedFrom = $(".trip-cargo-from").val();
    const fromStop = tripCargoStops.find(stop => String(stop.id) === String(selectedFrom));
    const fromOrder = fromStop ? Number(fromStop.order) : -Infinity;

    const availableStops = tripCargoStops.filter(stop => Number(stop.order) > fromOrder);

    $to.empty().append(placeholder);

    availableStops.forEach(stop => {
        $to.append($("<option>").val(String(stop.id)).text(stop.title));
    });

    const desiredTo = defaultTo ? String(defaultTo) : "";
    if (desiredTo && $to.find(`option[value="${desiredTo}"]`).length) {
        $to.val(desiredTo);
    } else if (availableStops.length === 1) {
        $to.val(String(availableStops[0].id));
    } else {
        $to.val("");
    }

    if (!$to.val()) {
        placeholder.prop("selected", true);
    }
}

function populateTripCargoStops(stops, defaults = {}) {
    tripCargoStops = Array.isArray(stops) ? stops : [];

    const $from = $(".trip-cargo-from");
    if (!$from.length) return;

    const placeholder = $("<option>")
        .val("")
        .text("Seçiniz")
        .prop("disabled", true);

    $from.empty().append(placeholder);

    tripCargoStops.forEach(stop => {
        $from.append($("<option>").val(String(stop.id)).text(stop.title));
    });

    const desiredFrom = defaults.fromStopId ? String(defaults.fromStopId) : "";
    if (desiredFrom && $from.find(`option[value="${desiredFrom}"]`).length) {
        $from.val(desiredFrom);
    } else {
        $from.val("");
    }

    if (!$from.val()) {
        placeholder.prop("selected", true);
    }

    const desiredTo = defaults.toStopId ? String(defaults.toStopId) : undefined;
    updateTripCargoToOptions(desiredTo);
}

function closeTripCargoPopup() {
    resetTripCargoForm();
    $(".trip-cargo-pop-up").css("display", "none");
    $(".blackout").css("display", "none");
}

function closeTripCargoListPopup() {
    $(".trip-cargo-list-nodes").html(tripCargoListLoadingHtml);
    $(".trip-cargo-list-pop-up").css("display", "none");
    $(".blackout").css("display", "none");
}

$(document).off("change", ".trip-cargo-from").on("change", ".trip-cargo-from", () => {
    updateTripCargoToOptions();
});

$(function () {
    hideLoading();
    $.get('/permissions')
        .done(perms => {
            window.permissions = perms;
        })
        .fail(err => console.error(err));
});

function getStaffPhone(id) {
    const staff = tripStaffList.find(s => s.id == id);
    return staff ? staff.phoneNumber : "";
}

function updateTripStaffPhones() {
    const getId = (selector, hidden) => $(selector).is("select") ? $(selector).val() : $(hidden).val();
    $(".trip-staff-captain-phone").val(getStaffPhone(getId(".trip-staff-captain", "#captainId")));
    $(".trip-staff-second-phone").val(getStaffPhone(getId(".trip-staff-second", "#driver2Id")));
    $(".trip-staff-third-phone").val(getStaffPhone(getId(".trip-staff-third", "#driver3Id")));
    $(".trip-staff-assistant-phone").val(getStaffPhone(getId(".trip-staff-assistant", "#assistantId")));
    $(".trip-staff-hostess-phone").val(getStaffPhone(getId(".trip-staff-hostess", "#hostessId")));
}

function initTimeInput(selector) {
    const el = document.querySelector(selector);
    if (!el) return;

    const onlyDigits = s => (s || "").replace(/\D/g, "");

    function formatTime(val) {
        let digits = onlyDigits(val).slice(0, 4); // max 4 hane
        if (digits.length >= 3) {
            return digits.slice(0, 2) + ":" + digits.slice(2);
        }
        return digits;
    }

    function normalizeTime(val) {
        if (!val.includes(":")) return "";
        let [hh, mm] = val.split(":").map(v => parseInt(v, 10));

        if (isNaN(hh) || isNaN(mm)) return "";

        // Saat aralığı
        if (hh < 0) hh = 0;
        if (hh > 23) hh = 23;

        // Dakika aralığı
        if (mm < 0) mm = 0;
        if (mm > 59) mm = 59;

        return `${hh.toString().padStart(2, "0")}:${mm
            .toString()
            .padStart(2, "0")}`;
    }

    // Yazarken formatla
    el.addEventListener("input", () => {
        el.value = formatTime(el.value);
    });

    // Blur’da doğrula/düzelt
    el.addEventListener("blur", () => {
        el.value = normalizeTime(el.value);
    });
}

initTimeInput(".trip-departure")

function initPhoneInput(selector, mobileOnly = false) {
    const input = document.querySelector(selector);

    if (!input) return;

    const onlyDigits = s => (s || "").replace(/\D/g, "");

    function normalizeTR(digits) {
        let d = onlyDigits(digits);
        if (d.startsWith("0")) d = d.slice(1); // baştaki 0 at
        return d.slice(0, 10);
    }

    function formatTR(d10) {
        let s = d10;
        if (!s) return "";
        let out = "";
        if (s.length > 0) out += s.slice(0, Math.min(3, s.length));
        if (s.length > 3) out += " " + s.slice(3, Math.min(6, s.length));
        if (s.length > 6) out += " " + s.slice(6, Math.min(8, s.length));
        if (s.length > 8) out += " " + s.slice(8, Math.min(10, s.length));
        return out;
    }

    input.addEventListener("input", () => {
        const d10 = normalizeTR(input.value);
        input.value = formatTR(d10);
        input.style.borderColor =
            d10.length === 10 && (!mobileOnly || d10.startsWith("5"))
                ? "green"
                : "";
    });

    input.addEventListener("blur", () => {
        const d10 = normalizeTR(input.value);

        if (d10.length !== 10) {
            input.value = "";
            return;
        }

        if (mobileOnly && !d10.startsWith("5")) {
            input.value = "";
            return;
        }

        input.value = formatTR(d10);
    });
}

initPhoneInput(".bus-phone")
initPhoneInput(".user-phone")

function initPlateInput(selector) {
    const el = document.querySelector(selector);
    if (!el) return;

    // Yalnızca A-Z ve 0-9 kalsın, harfleri büyüt
    const sanitize = s => (s || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

    // Anlık biçim: DD [SPACE] L{1,3} [SPACE] N{2,4}
    function formatPlate(raw) {
        const s = sanitize(raw);

        // 1) İl kodu -> ilk 2 rakam
        let d = s.match(/^\d{1,2}/)?.[0] || "";
        let rest = s.slice(d.length);

        // 2) Harfler -> 1-3 harf
        let L = rest.match(/^[A-Z]{1,3}/)?.[0] || "";
        rest = rest.slice(L.length);

        // 3) Rakamlar -> 2-4 rakam
        let n = rest.match(/^\d{1,4}/)?.[0] || "";

        // kes: toplam kısımların üst sınırlarını aşma
        d = d.slice(0, 2);
        L = L.slice(0, 3);
        n = n.slice(0, 4);

        let out = d;
        if (L.length) out += (out ? " " : "") + L;
        if (n.length) out += (out ? " " : "") + n;

        return out;
    }

    // Kesin doğrulama (blur için)
    function isValidPlate(val) {
        // Biçim kontrolü
        const m = /^(\d{2})\s([A-Z]{1,3})\s(\d{2,4})$/.exec(val);
        if (!m) return false;

        const il = parseInt(m[1], 10);
        if (il < 1 || il > 81) return false; // il kodu 01–81

        // Harflerde Türkçe ş,ç,ğ,ö,ü,ı kullanılmadığı varsayılır (regex zaten dışladı)
        return true;
    }

    el.addEventListener("input", () => {
        // Caret karmaşıklığına girmeden basitçe yeniden biçimlendir
        el.value = formatPlate(el.value);
    });

    el.addEventListener("blur", () => {
        if (!isValidPlate(el.value)) {
            // Geçersizse temizle
            el.value = "";
        }
    });
}

initPlateInput(".bus-license-plate")

function initTcknInputs(selector, opts = {}) {
    const els = document.querySelectorAll(selector);
    if (!els.length) return;

    const { clearOnInvalid = true, liveMark = false } = opts;

    const onlyDigits = s => (s || "").replace(/\D/g, "");

    function isValidTCKN(d) {
        if (!/^[1-9]\d{10}$/.test(d)) return false;
        const ds = d.split("").map(Number);

        const oddSum = ds[0] + ds[2] + ds[4] + ds[6] + ds[8];
        const evenSum = ds[1] + ds[3] + ds[5] + ds[7];
        const d10calc = ((oddSum * 7) - evenSum) % 10;
        if (d10calc !== ds[9]) return false;

        const sum10 = ds.slice(0, 10).reduce((a, b) => a + b, 0);
        const d11calc = sum10 % 10;
        if (d11calc !== ds[10]) return false;

        return true;
    }

    function sanitizeValue(raw) {
        let d = onlyDigits(raw);
        if (d.startsWith("0")) d = d.replace(/^0+/, "");
        return d.slice(0, 11);
    }

    els.forEach(el => {
        el.addEventListener("input", () => {
            const d = sanitizeValue(el.value);
            el.value = d;

            if (liveMark) {
                if (d.length === 11 && isValidTCKN(d)) {
                    el.style.borderColor = "green";
                } else {
                    el.style.borderColor = "";
                }
            }
        });

        el.addEventListener("blur", () => {
            const d = sanitizeValue(el.value);
            if (!d) { el.value = ""; el.style.borderColor = ""; return; }

            if (isValidTCKN(d)) {
                el.value = d;
                if (liveMark) el.style.borderColor = "green";
            } else {
                // if (clearOnInvalid) {
                //     el.value = "";
                //     el.style.borderColor = "";
                //     alert("Yanlış bir kimlik numarası girdiniz.")
                // }
            }
        });
    });
}


// Seferi yükler
async function loadTrip(date, time, tripId) {
    await $.ajax({
        url: "/get-trip",
        type: "GET",
        data: { date: date, time: time, stopId: currentStop, tripId: tripId },
        success: async function (response) {
            console.log(date)
            console.log(time)
            console.log(tripId)
            await $.ajax({
                url: "/get-passengers-table",
                type: "GET",
                data: { date: date, time: time, tripId, stopId: currentStop },
                success: function (response) {
                    $(".passenger-table").html(response)
                    $(document).off("click", ".passenger-table tbody tr")
                    $(".passenger-table tbody tr").on("click", function (e) {
                        const $row = $(this);
                        if (!$row.closest('#activeTickets').length) return;

                        const $popup = $(".taken-ticket-ops-pop-up");

                        // Eğer aynı satıra tıklandıysa popup kapat
                        if (currentPassengerRow && currentPassengerRow.is($row) && $popup.is(":visible")) {
                            $popup.hide();
                            currentPassengerRow = null;
                            selectedTakenSeats = [];
                            $(".passenger-table tbody tr").removeClass("selected");
                            return;
                        }

                        currentPassengerRow = $row;
                        $(".seat").removeClass("selected");
                        $(".passenger-table tbody tr").removeClass("selected");

                        currentGroupId = $row.data("group-id");
                        selectedTicketStopId = $row.data("stop-id");

                        const seatNumbers = [];
                        $(`.passenger-table tbody tr[data-group-id='${currentGroupId}']`).each(function () {
                            seatNumbers.push($(this).data("seat-number"));
                            $(this).addClass("selected");
                        });
                        selectedTakenSeats = seatNumbers;

                        updateTakenTicketOpsVisibility($row);

                        // Popup'ı mouse konumuna yerleştir
                        let left = e.pageX + 10;
                        let top = e.pageY + 10;

                        const popupWidth = $popup.outerWidth();
                        const popupHeight = $popup.outerHeight();
                        const viewportWidth = $(window).width();
                        const viewportHeight = $(window).height();

                        // Sağ kenarı taşmasın
                        if (left + popupWidth > viewportWidth) {
                            left = e.pageX - popupWidth - 10;
                            if (left < 0) left = 0;
                        }

                        // Alt kenarı taşmasın
                        if (top + popupHeight > $(window).scrollTop() + viewportHeight) {
                            top = e.pageY - popupHeight - 10;
                            if (top < 0) top = 0;
                        }

                        $popup.css({ left: left + "px", top: top + "px", display: "block", position: "absolute" });
                    });
                },
                error: function (xhr, status, error) {
                    console.log(error);
                }
            })

            await $.ajax({
                url: "/get-ticketops-popup",
                type: "GET",
                data: { date: date, time: time, tripId, stopId: currentStop },
                success: function (response) {
                    $(".ticket-ops-pop-up").html(response)
                },
                error: function (xhr, status, error) {
                    console.log(error);
                }
            })

            await $.ajax({
                url: "/get-trip-notes",
                type: "GET",
                data: { date: date, time: time, tripId },
                success: function (response) {
                    $(".trip-notes").html(response)
                },
                error: function (xhr, status, error) {
                    console.log(error);
                }
            })

            await $.ajax({
                url: "/get-route-stops-time-list",
                type: "GET",
                data: { date: date, time: time, tripId: tripId },
                success: function (response) {
                    $(".stops-times").html(response)
                },
                error: function (xhr, status, error) {
                    console.log(error);
                }
            })

            $(".busPlan").html(response)
            document.querySelectorAll('.seat-row').forEach(row => {
                const seats = row.querySelectorAll('.seat');

                if (
                    Array.from(seats).every(seat =>
                        seat.classList.contains('hidden') || seat.classList.contains('none')
                    )
                ) {
                    row.remove();
                }
            });

            // Adjacent seat gender indicators
            document.querySelectorAll('.seat').forEach(seat => {
                const gender = seat.dataset.gender;
                if (gender !== 'm' && gender !== 'f') return;

                const row = seat.closest('.seat-row');
                const seats = Array.from(row.querySelectorAll('.seat')).filter(s => !s.classList.contains('none'));
                const index = seats.indexOf(seat);

                if (index > 0) {
                    const leftSeat = seats[index - 1];
                    if (!leftSeat.dataset.gender) {
                        leftSeat.dataset.onlyGender = gender;
                    }
                }

                if (index < seats.length - 1) {
                    const rightSeat = seats[index + 1];
                    if (!rightSeat.dataset.gender) {
                        rightSeat.dataset.onlyGender = gender;
                    }
                }
            });

            currentTripDate = $("#tripDate").val()
            currentTripTime = $("#tripTime").val()
            currentTripPlaceTime = $("#tripPlaceTime").val()
            currentTripId = $("#tripId").val()
            selectedSeats = []
            selectedTakenSeats = []

            fromId = $("#fromId").val()
            toId = $("#toId").val()
            fromStr = $("#fromStr").val()
            toStr = $("#toStr").val()

            $("#tickets").remove()
            $("#tripDate").remove()
            $("#tripTime").remove()
            $("#tripPlaceTime").remove()
            $("#tripId").remove()
            $("#fromId").remove()
            $("#toId").remove()
            $("#fromStr").remove()
            $("#toStr").remove()

            $(".ticket-info-pop-up_from").html(fromStr.toUpperCase())
            $(".ticket-info-pop-up_to").html(toStr.toUpperCase())

            const tripBusId = $(".trip-bus-license-plate").data("current-bus-id")
            const tripBusModelId = $(".trip-bus-plan").data("current-bus-model-id")

            try {
                const [busModels, buses] = await Promise.all([
                    $.get("/get-bus-models-data"),
                    $.get("/get-buses-data")
                ])

                const $planEl = $(".trip-bus-plan")
                const $plateEl = $(".trip-bus-license-plate")

                if ($planEl.is("select")) {
                    const planOpts = [$("<option>").val("").html("Koltuk planı seçiniz.").prop("disabled", true).prop("selected", true)]
                    busModels.forEach(bm => planOpts.push($("<option>").val(bm.id).html(bm.title)))
                    $planEl.html(planOpts)
                    if (tripBusModelId) $planEl.val(tripBusModelId)
                    $(document).off("change", ".trip-bus-plan")
                    if ($(".trip-bus-plan").is("select")) {
                        $(document).on("change", ".trip-bus-plan", async function () {
                            const busModelId = $(this).val()

                            $plateEl.val("")
                            $(".captain-name").html("")
                            $(".captain-phone").html("")

                            try {
                                await $.post("/post-trip-bus-plan", { tripId: currentTripId, busModelId: busModelId })
                                loadTrip(currentTripDate, currentTripTime, currentTripId)
                            } catch (err) {
                                console.log(err)
                            }
                        })
                    }
                } else if ($planEl.is("input")) {
                    const modelTitle = busModels.find(bm => bm.id === tripBusModelId)?.title || ""
                    $planEl.val(modelTitle)
                }

                if ($plateEl.is("select")) {
                    const plateOpts = [$("<option>").val("").html("Plaka seçiniz.").prop("disabled", true).prop("selected", true)]
                    buses.forEach(b => {
                        const busModel = busModels.find(bm => bm.id === b.busModelId)
                        const opt = $("<option>")
                            .val(b.id)
                            .html(b.licensePlate)
                            .attr("data-bus-model-id", b.busModelId)
                            .attr("data-bus-model-title", busModel ? busModel.title : "")
                            .attr("data-captain-name", b.captain ? `${b.captain.name} ${b.captain.surname}` : "")
                            .attr("data-captain-phone", b.captain ? b.captain.phoneNumber : "")
                        plateOpts.push(opt)
                    })
                    $plateEl.html(plateOpts)
                    if (tripBusId) $plateEl.val(tripBusId)

                    $(document).off("change", ".trip-bus-license-plate")
                    if ($(".trip-bus-license-plate").is("select")) {
                        $(document).on("change", ".trip-bus-license-plate", async function () {
                            const busId = $(this).val()
                            const selected = $(this).find("option:selected")
                            const busModelId = selected.data("bus-model-id")
                            const busModelTitle = selected.data("bus-model-title")
                            const captainName = selected.data("captain-name")
                            const captainPhone = selected.data("captain-phone")

                            if ($planEl.is("select")) {
                                $planEl.val(busModelId)
                            } else {
                                $planEl.val(busModelTitle || "")
                            }
                            $(".captain-name").html(captainName || "")
                            $(".captain-phone").html(captainPhone || "")

                            try {
                                await $.post("/post-trip-bus", { tripId: currentTripId, busId: busId })
                                loadTrip(currentTripDate, currentTripTime, currentTripId)
                            } catch (err) {
                                console.log(err)
                            }
                        })
                    }
                } else if ($plateEl.is("input")) {
                    const selectedBus = buses.find(b => b.id === tripBusId)
                    $plateEl.val(selectedBus ? selectedBus.licensePlate : "")
                    if (selectedBus) {
                        if ($planEl.is("select")) {
                            $planEl.val(selectedBus.busModelId)
                        } else {
                            const modelTitle = busModels.find(bm => bm.id === selectedBus.busModelId)?.title || ""
                            $planEl.val(modelTitle)
                        }
                        $(".captain-name").html(selectedBus.captain ? `${selectedBus.captain.name} ${selectedBus.captain.surname}` : "")
                        $(".captain-phone").html(selectedBus.captain ? selectedBus.captain.phoneNumber : "")
                    }
                }
            } catch (err) {
                console.log(err)
            }

            await $.ajax({
                url: "/get-route-stops-list-moving",
                type: "GET",
                data: { date: date, time: time, tripId: tripId, stopId: currentStop },
                success: function (response) {
                    console.log(response)
                    let arr = []
                    const opt = $("<option>").html("").val("")
                    arr.push(opt)
                    for (let i = 0; i < response.length; i++) {
                        const rs = response[i];
                        const opt = $("<option>").html(rs.stopStr).val(rs.isRestricted ? "" : rs.stopId)
                        if (rs.isRestricted) {
                            opt.addClass("restricted")
                            opt.prop("disabled", true)
                        }
                        arr.push(opt)
                    }
                    $(".move-to-trip-place-select").html(arr)
                    if (isMovingActive) {
                        $(".move-to-trip-date").html(`${new Date(currentTripDate).getDate()}/${Number(new Date(currentTripDate).getMonth()) + 1} | ${currentTripPlaceTime.split(":")[0] + "." + currentTripPlaceTime.split(":")[1]}`)
                        $(".move-to-trip-place").html(`${currentStopStr}`)
                        $(".move-to").css("display", "flex")
                    }
                },
                error: function (xhr, status, error) {
                    console.log(error);
                }
            })

            // $(document).on("click", function () {
            //     $(".ticket-ops-pop-up").hide();
            //     $(".taken-ticket-ops-pop-up").hide();
            //     currentSeat = null;
            // });

            $(document).off("click", ".trip-option-revenues");
            $(document).on("click", ".trip-option-revenues", async function (e) {
                e.stopPropagation();
                try {
                    const revenues = await $.get("/get-trip-revenues", { tripId: currentTripId, stopId: fromId });
                    const rows = [];
                    revenues.branches.forEach(b => {
                        rows.push(`
                            <tr>
                                <td>${b.title}</td>
                                <td>${b.currentCount}</td>
                                <td>${b.currentAmount}₺</td>
                                <td>${b.totalCount}</td>
                                <td>${b.totalAmount}₺</td>
                            </tr>`);
                    });
                    $(".trip-revenue-rows").html(rows.join(""));
                    $(".trip-revenue-total-current-count").html(revenues.totals.currentCount);
                    $(".trip-revenue-total-current-amount").html(revenues.totals.currentAmount + "₺");
                    $(".trip-revenue-total-all-count").html(revenues.totals.totalCount);
                    $(".trip-revenue-total-all-amount").html(revenues.totals.totalAmount + "₺");
                    $(".trip-revenue-pop-up").css("display", "block");
                    $(".blackout").css("display", "block");
                } catch (err) {
                    console.log(err);
                }
            });

            $(document).off("click", ".trip-option-staff");
            $(document).on("click", ".trip-option-staff", async function (e) {
                e.stopPropagation();
                try {
                    const staffs = await $.get("/get-staffs-list", { onlyData: true });
                    tripStaffList = staffs;
                    if ($(".trip-staff-captain").is("select")) {
                        const drivers = staffs.filter(s => s.duty === "driver");
                        const assistants = staffs.filter(s => s.duty === "assistant");
                        const hostesses = staffs.filter(s => s.duty === "hostess");
                        const driverOpts = drivers.map(d => `<option value="${d.id}">${d.name} ${d.surname}</option>`).join("");
                        const assistantOpts = assistants.map(a => `<option value="${a.id}">${a.name} ${a.surname}</option>`).join("");
                        const hostessOpts = hostesses.map(h => `<option value="${h.id}">${h.name} ${h.surname}</option>`).join("");
                        $(".trip-staff-captain, .trip-staff-second, .trip-staff-third").html(`<option value="">Seçilmedi</option>` + driverOpts);
                        $(".trip-staff-assistant").html(`<option value="">Seçilmedi</option>` + assistantOpts);
                        $(".trip-staff-hostess").html(`<option value="">Seçilmedi</option>` + hostessOpts);
                        $(".trip-staff-captain").val($("#captainId").val());
                        $(".trip-staff-second").val($("#driver2Id").val());
                        $(".trip-staff-third").val($("#driver3Id").val());
                        $(".trip-staff-assistant").val($("#assistantId").val());
                        $(".trip-staff-hostess").val($("#hostessId").val());
                        updateTripStaffPhones();
                    } else {
                        const getName = id => {
                            const staff = tripStaffList.find(s => s.id == id);
                            return staff ? `${staff.name} ${staff.surname}` : "";
                        };
                        $(".trip-staff-captain").val(getName($("#captainId").val()));
                        $(".trip-staff-second").val(getName($("#driver2Id").val()));
                        $(".trip-staff-third").val(getName($("#driver3Id").val()));
                        $(".trip-staff-assistant").val(getName($("#assistantId").val()));
                        $(".trip-staff-hostess").val(getName($("#hostessId").val()));
                        updateTripStaffPhones();
                    }
                    tripStaffInitial = {
                        captainId: $(".trip-staff-captain").val() || "",
                        driver2Id: $(".trip-staff-second").val() || "",
                        driver3Id: $(".trip-staff-third").val() || "",
                        assistantId: $(".trip-staff-assistant").val() || "",
                        hostessId: $(".trip-staff-hostess").val() || ""
                    };
                    $(".trip-staff-pop-up").css("display", "block");
                    $(".blackout").css("display", "block");
                } catch (err) {
                    console.log(err);
                }
            });

            $(document).off("click", ".trip-cargo-add");
            $(".trip-cargo-add").on("click", async function (e) {
                try {
                    const stops = await $.get("/get-trip-stops", { tripId: currentTripId });
                    resetTripCargoForm();
                    populateTripCargoStops(stops, { fromStopId: fromId, toStopId: toId });
                    $(".trip-cargo-pop-up").css("display", "block");
                    $(".blackout").css("display", "block");
                } catch (err) {
                    console.log(err);
                }
            });

            $(document).off("click", ".trip-cargo-list");
            $(".trip-cargo-list").on("click", async function (e) {
                e.preventDefault();
                if (!currentTripId) {
                    showError("Sefer bilgisi bulunamadı.");
                    return;
                }

                $(".trip-cargo-list-nodes").html(tripCargoListLoadingHtml);
                $(".trip-cargo-list-pop-up").css("display", "block");
                $(".blackout").css("display", "block");

                try {
                    const html = await $.get("/get-trip-cargo-list", { tripId: currentTripId });
                    $(".trip-cargo-list-nodes").html(html);
                    $(document).off("click", ".trip-cargo-refund");
                    $(".trip-cargo-refund").on("click", async function (e) {
                        e.preventDefault();
                        e.stopPropagation();

                        const $button = $(this);
                        const cargoId = Number($button.data("id"));

                        if (!cargoId) {
                            showError("Kargo bilgisi bulunamadı.");
                            return;
                        }

                        const confirmMessage = "Bu kargo kaydını iade etmek istediğinize emin misiniz?";

                        if (!window.confirm(confirmMessage)) {
                            return;
                        }

                        const originalHtml = $button.html();
                        $button
                            .prop("disabled", true)
                            .html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>');

                        try {
                            await $.post("/post-refund-cargo", { cargoId });
                        } catch (err) {
                            const message = err?.responseJSON?.message || err?.responseText || "Kargo iadesi sırasında bir hata oluştu.";
                            showError(message);
                            $button.prop("disabled", false).html(originalHtml);
                            return;
                        }

                        const $group = $button.closest(".btn-group");
                        const $container = $group.closest(".trip-cargo-list-nodes");
                        $group.remove();

                        if (!$container.find(".btn-group").length) {
                            $container.html('<p class="text-center text-muted m-0">Bu sefere ait kargo bulunamadı.</p>');
                        }
                    });
                } catch (err) {
                    console.log(err);
                    showError("Kargo listesi alınamadı.");
                    $(".trip-cargo-list-nodes").html('<p class="text-center text-danger m-0">Kargo listesi alınamadı.</p>');
                }
            });

            $(document).off("click", ".trip-option-cancel-trip");
            $(document).on("click", ".trip-option-cancel-trip", async function (e) {
                e.stopPropagation();
                if (!confirm("Seferi iptal etmek istediğinize emin misiniz?")) return;
                try {
                    await $.post("/post-trip-active", { tripId: currentTripId, isActive: false });
                    loadTrip(currentTripDate, currentTripTime, currentTripId);
                    loadTripsList(calendar.val())
                } catch (err) {
                    console.log(err);
                }
            });

            $(document).off("click", ".trip-option-active-trip");
            $(document).on("click", ".trip-option-active-trip", async function (e) {
                e.stopPropagation();
                if (!confirm("Seferi aktif etmek istediğinize emin misiniz?")) return;
                try {
                    await $.post("/post-trip-active", { tripId: currentTripId, isActive: true });
                    loadTrip(currentTripDate, currentTripTime, currentTripId);
                    loadTripsList(calendar.val())
                } catch (err) {
                    console.log(err);
                }
            });

            $(document).off("click", ".trip-option-stop-restriction");
            $(document).on("click", ".trip-option-stop-restriction", function (e) {
                e.stopPropagation();
                $.ajax({
                    url: "/get-trip-stop-restriction",
                    type: "GET",
                    data: { tripId: currentTripId },
                    success: function (response) {
                        $(".trip-stop-restriction-content").html(response);
                        tripStopRestrictionChanges = {};
                        tripStopRestrictionDirty = false;
                        $(".trip-stop-restriction-pop-up").css("display", "block");
                        $(".blackout").css("display", "block");
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                });
            });

            $(document).off("change", ".trip-stop-restriction-checkbox");
            $(document).on("change", ".trip-stop-restriction-checkbox", function () {
                const fromId = this.dataset.from;
                const toId = this.dataset.to;
                const key = `${fromId}-${toId}`;
                const initial = this.dataset.initial === "true";
                const isAllowed = this.checked;
                if (isAllowed === initial) {
                    delete tripStopRestrictionChanges[key];
                } else {
                    tripStopRestrictionChanges[key] = isAllowed;
                }
                tripStopRestrictionDirty = Object.keys(tripStopRestrictionChanges).length > 0;
            });

            $(document).off("click", ".trip-stop-restriction-save");
            $(document).on("click", ".trip-stop-restriction-save", async function () {
                const entries = Object.entries(tripStopRestrictionChanges);
                if (entries.length === 0) {
                    closeTripStopRestriction();
                    return;
                }
                try {
                    await Promise.all(entries.map(([key, isAllowed]) => {
                        const [fromId, toId] = key.split("-");
                        return $.post("/post-trip-stop-restriction", {
                            tripId: currentTripId,
                            fromId,
                            toId,
                            isAllowed: isAllowed ? 1 : 0
                        });
                    }));
                    entries.forEach(([key, isAllowed]) => {
                        const [fromId, toId] = key.split("-");
                        const checkbox = document.querySelector(`.trip-stop-restriction-checkbox[data-from='${fromId}'][data-to='${toId}']`);
                        if (checkbox) {
                            checkbox.dataset.initial = String(isAllowed);
                        }
                    });
                    tripStopRestrictionChanges = {};
                    tripStopRestrictionDirty = false;
                    closeTripStopRestriction();
                    loadTrip(currentTripDate, currentTripTime, currentTripId);
                } catch (err) {
                    console.log(err);
                }
            });

            $(document).on("change", ".trip-staff-captain, .trip-staff-second, .trip-staff-third, .trip-staff-assistant, .trip-staff-hostess", updateTripStaffPhones);

            $(".ticket-op").on("click", e => {
                e.stopPropagation();

                $(".ticket-op ul").css("display", "none");

                const ul = e.currentTarget.querySelector("ul");
                const isVisible = $(ul).css("display") === "flex";

                if (!isVisible) {
                    $(ul).css("display", "flex");
                }
            });

            $(document).off("click").on("click", () => {
                $(".ticket-op ul").css("display", "none");
            });

            $(".ticket-op-button").on("click", async e => {
                const button = e.currentTarget
                const action = e.currentTarget.dataset.action
                const fromId = currentStop
                const toId = button.dataset.stopId

                for (let i = 0; i < selectedSeats.length; i++) {
                    const seat = selectedSeats[i];
                    seatTypes.push($(`.seat-${seat}`).data("seat-type"))
                }

                $(".ticket-ops-pop-up").hide()
                await $.ajax({
                    url: "/get-ticket-row",
                    type: "GET",
                    data: { action: e.currentTarget.dataset.action, gender: button.dataset.gender, seats: selectedSeats, seatTypes: seatTypes, fromId: fromId, toId: toId, date: currentTripDate, time: currentTripTime, tripId: currentTripId, stopId: currentStop },
                    success: function (response) {
                        $(".ticket-info-pop-up_from").html(currentStopStr.toLocaleUpperCase())
                        $(".ticket-info-pop-up_to").html(button.dataset.routeStop.toLocaleUpperCase())
                        $(".ticket-row").remove()
                        $(".ticket-info").remove()
                        $(".ticket-button-action").attr("data-action", action)
                        $(".ticket-button-action").html(action == "sell" ? "SAT" : "REZERVE ET")
                        $(".ticket-rows").prepend(response)

                        seatTypes = []

                        initTcknInputs(".identity input")
                        initPhoneInput(".phone input")

                        $(".ticket-row").each((i, e) => {
                            originalPrices[i] = Number($(".ticket-row").find(".price").find("input").val())
                        })
                        $(".identity input").on("blur", async e => {
                            const customer = await $.ajax({ url: "/get-customer", type: "GET", data: { idNumber: e.currentTarget.value } });
                            if (customer) {
                                const row = e.currentTarget.parentElement.parentElement
                                const rows = [...document.querySelectorAll('.ticket-row')];
                                const originalPrice = originalPrices[rows.indexOf(e.currentTarget.closest('.ticket-row'))];
                                $(row).find(".name").find("input").val(customer.name)
                                $(row).find(".surname").find("input").val(customer.surname)
                                $(row).find(".category").find("input").val(customer.customerCategory)
                                $(row).find(".type").find("input").val(customer.customerType)
                                $(row).find(".nationality").find("input").val(customer.nationality)
                                $(row).find(".price").find("span.customer-point")
                                    .html(customer.pointOrPercent == "point" ? customer.point_amount + " p" : customer.percent + "%")
                                    .addClass("text-danger")
                                    .data("pointorpercent", customer.pointOrPercent)
                                    .data("pointamount", customer.point_amount)
                                $(row).find(".price").find("input").val(originalPrice)
                                if (customer.pointOrPercent == "percent") {
                                    const discount = Number(customer.percent)
                                    const newPrice = originalPrice - (originalPrice / 100 * discount)
                                    $(row).find(".price").find("input").val(newPrice)
                                }
                                else if (!customer.pointOrPercent) {
                                    $(row).find(".price").find("span.customer-point")
                                        .html("")
                                        .removeClass("text-danger")
                                        .data("pointorpercent", "")
                                        .data("pointamount", "")
                                }
                                if (customer.gender == "m") {
                                    $(row).find(".gender").find("input.male").prop("checked", true)
                                    $(row).find(".gender").find("input.female").prop("checked", false)
                                    $(row).addClass("m").removeClass("f")
                                }
                                else if (customer.gender == "f") {
                                    $(row).find(".gender").find("input.male").prop("checked", false)
                                    $(row).find(".gender").find("input.female").prop("checked", true)
                                    $(row).addClass("f").removeClass("m")
                                }
                                $(".ticket-rows").find(".phone").find("input").val(customer.phoneNumber)
                            }
                        })

                        $(".ticket-info-pop-up").css("display", "block")
                        $(".blackout").css("display", "block")

                        flatpickr($(".reservation-expire input.changable.date"), {
                            locale: "tr",
                        })
                        flatpickr($(".reservation-expire input.changable.time"), {
                            locale: "tr",
                            enableTime: true,
                            noCalendar: true,
                        })

                        $(document).on("change", ".ticket-row input[type='radio']", function () {
                            const $row = $(this).closest(".ticket-row");

                            $row.removeClass("m f");

                            if ($(this).val() === "m") {
                                $row.addClass("m");
                            } else if ($(this).val() === "f") {
                                $row.addClass("f");
                            }
                        });

                        $(".seat").removeClass("selected")
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                });
            })

            // Tek handler: önce eskileri kaldır, sonra bağla
            $(".seat").off("click.seat").on("click.seat", function (e) {
                e.stopPropagation();

                const $seat = $(this);
                const rect = this.getBoundingClientRect();
                const { createdAt, seatNumber, groupId } = e.currentTarget.dataset;
                const isTaken = Boolean(createdAt); // dolu koltuk mu?

                // ---- Taşıma modu ----
                if (isMovingActive) {
                    $(".move-to-trip-date").html(`${new Date(currentTripDate).getDate()}/${Number(new Date(currentTripDate).getMonth()) + 1} | ${currentTripPlaceTime.split(":")[0] + "." + currentTripPlaceTime.split(":")[1]}`)
                    $(".move-to-trip-place").html(`${currentStopStr}`)
                    $(".move-to").css("display", "flex")
                    // DOLU koltuklarda (grup) davranış
                    if (isTaken) {
                        if (selectedTakenSeats.length > 0) {
                            // varsa temizle
                            selectedTakenSeats = [];
                            $(".seat").removeClass("selected");
                        } else {
                            // grupça seç
                            const seatNumbers = [];
                            $(".seat").each((i, el) => {
                                if (el.dataset.groupId == groupId) {
                                    seatNumbers.push(el.dataset.seatNumber);
                                    el.classList.add("selected");
                                }
                            });
                            selectedTakenSeats = seatNumbers;
                        }
                        return;
                    }

                    // BOŞ koltuklarda hedef seçim
                    const already = selectedSeats.includes(seatNumber);
                    const targetCount = movingSelectedSeats.length;

                    if (already) {
                        // seçimi kaldır
                        selectedSeats = selectedSeats.filter(s => s !== seatNumber);
                        $seat.removeClass("selected");
                        return;
                    }

                    if (selectedSeats.length >= targetCount) {
                        alert("Transfer edilen yolcu sayısından fazla koltuk seçtiniz.");
                        return;
                    }

                    selectedSeats.push(seatNumber);
                    $seat.addClass("selected");

                    // İlgili buton metnini güncelle (mevcut mantığını korudum)
                    const $btn = $(".moving-ticket-button").eq(selectedSeats.length - 1);
                    if ($btn.length) {
                        $btn.html($btn.html() + ` => ${seatNumber}`);
                    }

                    return; // taşıma modunda popup yok
                }

                // ---- Normal mod (popup + seçim) ----
                const $popup = isTaken ? $(".taken-ticket-ops-pop-up") : $(".ticket-ops-pop-up");

                $(".ticket-op").css("display", "flex")

                if ($seat.data("only-gender") == "m") $(".ticket-op.f").css("display", "none")
                else if ($seat.data("only-gender") == "f") $(".ticket-op.m").css("display", "none")

                // Aynı koltuğa tekrar tıklandıysa ve popup açıksa kapat
                if (currentSeat && currentSeat.is($seat) && $popup.is(":visible")) {
                    $popup.hide();
                    currentSeat = null;
                } else {
                    currentSeat = $seat;

                    // Popup pozisyonu
                    let left = rect.right + window.scrollX + 10;
                    let top = rect.top + window.scrollY + 25;

                    $popup.css({ left: left + "px", top: top + "px", display: "block" });

                    // Aşağı taşarsa yukarı al
                    const popupHeight = $popup.outerHeight();
                    const viewportBottom = window.scrollY + window.innerHeight;
                    if (top + popupHeight > viewportBottom) {
                        top = rect.top + window.scrollY - popupHeight - 10;
                        if (top < 0) top = 0;
                        $popup.css("top", top + "px");
                    }
                }

                // Seçim davranışı (normal mod)
                if (!isTaken) {
                    // boş koltuk toggle
                    if (!selectedSeats.includes(seatNumber)) {
                        selectedSeats.push(seatNumber);
                        $seat.addClass("selected");
                    } else {
                        selectedSeats = selectedSeats.filter(s => s !== seatNumber);
                        $seat.removeClass("selected");
                    }
                } else {
                    // dolu koltuk: grupça seç/kaldır
                    currentGroupId = $seat.data("group-id")
                    selectedTicketStopId = currentStop;
                    updateTakenTicketOpsVisibility($seat)

                    if (selectedTakenSeats.length > 0) {
                        selectedTakenSeats = [];
                        $(".seat").removeClass("selected");
                    } else {
                        const seatNumbers = [];
                        $(".seat").each((i, el) => {
                            if (el.dataset.groupId == groupId) {
                                seatNumbers.push(el.dataset.seatNumber);
                                el.classList.add("selected");
                            }
                        });
                        selectedTakenSeats = seatNumbers;
                    }
                }
            });


            $(".seat").on("mouseenter", function (e) {
                const data = e.currentTarget.dataset

                const rect = this.getBoundingClientRect();
                const popupLeft = rect.right + window.scrollX + 10;
                const popupTop = rect.top + window.scrollY;

                $(".passenger-info-popup .name-phone-container").css("display", "block")
                $(".passenger-info-popup .price-container").css("display", "block")
                $(".passenger-info-popup .payment-container").css("display", "block")
                $(".passenger-info-popup .pnr-container").css("display", "block")
                if (data.createdAt) {
                    $(".passenger-info-popup").removeClass("m").removeClass("f").removeClass("p")
                    if (data.status == "pending") {
                        $(".passenger-info-popup").addClass("p")
                        $(".passenger-info-popup .name-phone-container").css("display", "none")
                        $(".passenger-info-popup .price-container").css("display", "none")
                        $(".passenger-info-popup .payment-container").css("display", "none")
                        $(".passenger-info-popup .pnr-container").css("display", "none")
                    }
                    else
                        $(".passenger-info-popup").addClass(data.gender)
                    $(".passenger-info-popup .seat-number").html(data.seatNumber)
                    $(".passenger-info-popup .from").html(data.from)
                    $(".passenger-info-popup .to").html(data.to)
                    $(".passenger-info-popup .name").html(data.name)
                    $(".passenger-info-popup .username").html(data.userName)
                    $(".passenger-info-popup .userBranch").html(data.branch)
                    $(".passenger-info-popup .phone").html(data.phone)
                    $(".passenger-info-popup .price").html(data.price ? data.price + "₺" : "")
                    $(".passenger-info-popup .payment").html(data.payment == "cash" ? "Nakit" : data.payment == "card" ? "Kredi Kartı" : data.payment == "point" ? "Puan" : "")
                    $(".passenger-info-popup .pnr").html(data.pnr ? data.pnr : "")
                    const date = new Date(data.createdAt)
                    $(".passenger-info-popup .createdAt").html(date.toLocaleDateString() + " " + date.toLocaleTimeString())

                    $(".passenger-info-popup").css({
                        left: popupLeft + "px",
                        top: popupTop + "px",
                        display: "block"
                    });
                }
            });

            $(".seat").on("mouseleave", function () {
                $(".passenger-info-popup").hide();
            });
            $(".account-cut").on("click", async () => {
                $(".account-cut-popup .account-deduction1, .account-cut-popup .account-deduction2, .account-cut-popup .account-deduction3, .account-cut-popup .account-deduction4, .account-cut-popup .account-deduction5, .account-cut-popup .account-tip, .account-cut-popup .account-description, .account-cut-popup .account-payed").prop("readonly", false);
                $(".account-cut-save").show();
                $(".account-cut-undo-btn").hide();
                accountCutId = null;
                try {
                    accountCutData = await $.ajax({
                        url: "/get-bus-account-cut",
                        type: "GET",
                        data: { tripId: currentTripId, stopId: currentStop }
                    });
                    $(".account-cut-total-count").val(accountCutData.totalCount);
                    $(".account-cut-total-amount").val(accountCutData.totalAmount.toFixed(2));
                    $(".account-comission-percent").val(accountCutData.comissionPercent.toFixed(2));
                    $(".account-cut-popup .my-cash").val(accountCutData.myCash.toFixed(2));
                    $(".account-cut-popup .my-card").val(accountCutData.myCard.toFixed(2));
                    $(".account-cut-popup .other-branches").val(accountCutData.otherBranches.toFixed(2));
                    $(".account-cut-popup .all-total").val(accountCutData.allTotal.toFixed(2));
                    $(".account-cut-popup .account-commission").val(accountCutData.comissionAmount.toFixed(2));
                    $(".account-cut-popup .account-needtopay").val(accountCutData.needToPay.toFixed(2));
                    $(".account-cut-popup .account-payed").val(accountCutData.needToPay.toFixed(2));
                } catch (err) {
                    console.log(err);
                }
                $(".account-cut-deductions-popup").css("display", "block");
                $(".blackout").css("display", "block");
            });

            $(".accountCut").on("click", e => {
                e.preventDefault();
                window.open(`/get-bus-account-cut-receipt?tripId=${currentTripId}&stopId=${currentStop}`, "_blank", "width=800,height=600");
            });

            $(".account-cut-undo").on("click", async () => {
                try {
                    const data = await $.ajax({
                        url: "/get-bus-account-cut-record",
                        type: "GET",
                        data: { tripId: currentTripId, stopId: currentStop }
                    });
                    accountCutId = data.id;
                    $(".account-cut-popup .my-cash").val(Number(data.myCash).toFixed(2));
                    $(".account-cut-popup .my-card").val(Number(data.myCard).toFixed(2));
                    $(".account-cut-popup .other-branches").val(Number(data.otherBranches).toFixed(2));
                    $(".account-cut-popup .all-total").val(Number(data.allTotal).toFixed(2));
                    $(".account-cut-popup .account-commission").val(Number(data.comissionAmount).toFixed(2));
                    for (let i = 1; i <= 5; i++) {
                        $(".account-cut-popup .account-deduction" + i).val(data["deduction" + i]);
                    }
                    $(".account-cut-popup .account-tip").val(data.tip);
                    $(".account-cut-popup .account-description").val(data.description);
                    $(".account-cut-popup .account-needtopay").val(Number(data.needToPay).toFixed(2));
                    $(".account-cut-popup .account-payed").val(Number(data.payedAmount).toFixed(2));
                    $(".account-cut-popup .account-deduction1, .account-cut-popup .account-deduction2, .account-cut-popup .account-deduction3, .account-cut-popup .account-deduction4, .account-cut-popup .account-deduction5, .account-cut-popup .account-tip, .account-cut-popup .account-description, .account-cut-popup .account-payed").prop("readonly", true);
                    $(".account-cut-save").hide();
                    $(".account-cut-undo-btn").show();
                    $(".account-cut-popup").css("display", "block");
                    $(".blackout").css("display", "block");
                } catch (err) {
                    console.log(err);
                }
            });

            $(".account-cut-undo-btn").on("click", async () => {
                if (!accountCutId) return;
                try {
                    await $.ajax({ url: "/post-delete-bus-account-cut", type: "POST", data: { id: accountCutId } });
                    loadTrip(currentTripDate, currentTripTime, currentTripId);
                } catch (err) {
                    console.log(err);
                }
                $(".account-cut-popup").css("display", "none");
                $(".blackout").css("display", "none");
            });

            $(".account-cut-deductions-cancel").on("click", () => {
                $(".account-cut-deductions-popup").css("display", "none");
                $(".blackout").css("display", "none");
            });

            $(".account-cut-deductions-continue").on("click", () => {
                for (let i = 1; i <= 5; i++) {
                    const val = $(".account-cut-deductions-popup .account-deduction" + i).val();
                    $(".account-cut-popup .account-deduction" + i).val(val);
                }
                const tip = $(".account-cut-deductions-popup .account-tip").val();
                $(".account-cut-popup .account-tip").val(tip);
                $(".account-cut-deductions-popup").css("display", "none");
                $(".account-cut-popup").css("display", "block");
                updateAccountNeedToPay();
            });

            $(".account-cut-close").on("click", () => {
                $(".account-cut-popup").css("display", "none");
                $(".blackout").css("display", "none");
            });

            $(".account-cut-save").off("click").on("click", async () => {
                const data = {
                    tripId: currentTripId,
                    stopId: currentStop,
                    comissionPercent: $(".account-comission-percent").val(),
                    deduction1: $(".account-cut-popup .account-deduction1").val(),
                    deduction2: $(".account-cut-popup .account-deduction2").val(),
                    deduction3: $(".account-cut-popup .account-deduction3").val(),
                    deduction4: $(".account-cut-popup .account-deduction4").val(),
                    deduction5: $(".account-cut-popup .account-deduction5").val(),
                    tip: $(".account-cut-popup .account-tip").val(),
                    description: $(".account-cut-popup .account-description").val(),
                    payedAmount: $(".account-cut-popup .account-payed").val()
                };
                try {
                    await $.ajax({ url: "/post-bus-account-cut", type: "POST", data });
                    loadTrip(currentTripDate, currentTripTime, currentTripId);
                } catch (err) {
                    console.log(err);
                }
                $(".account-cut-popup").css("display", "none");
                $(".blackout").css("display", "none");
            });

            function updateAccountNeedToPay() {
                if (!accountCutData) return;
                let deductions = 0;
                for (let i = 1; i <= 5; i++) {
                    deductions += Number($(".account-cut-popup .account-deduction" + i).val()) || 0;
                }
                deductions += Number($(".account-cut-popup .account-tip").val()) || 0;
                const need = accountCutData.allTotal - accountCutData.comissionAmount - deductions;
                $(".account-cut-popup .account-needtopay").val(need.toFixed(2));
            }

            $(".account-cut-popup .account-deduction1, .account-cut-popup .account-deduction2, .account-cut-popup .account-deduction3, .account-cut-popup .account-deduction4, .account-cut-popup .account-deduction5, .account-cut-popup .account-tip").on("input", updateAccountNeedToPay);
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });

}

// Site ilk açıldığında bugünün seferini yükler
$(document).ready(function () {
    // loadTrip('2025-05-12', '12:30:00', 1)
    loadTripsList("2025-05-12")
})

// Sefer listesini yükler
async function loadTripsList(dateStr) {
    await $.ajax({
        url: "/get-day-trips-list",
        type: "GET",
        data: { date: dateStr, stopId: currentStop, tripId: currentTripId },
        success: function (response) {
            $(".tripRows").html(response)
            $(".tripRow").on("click", async e => {
                const date = e.currentTarget.dataset.date
                const time = e.currentTarget.dataset.time
                const tripId = e.currentTarget.dataset.tripid
                console.log(tripId)

                loadTrip(date, time, tripId)
            })
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
}

// Bilet kesim ekranını kapatır
function ticketClose() {
    selectedSeats = [];
    $(".ticket-info-pop-up").css("display", "none");
    $(".blackout").css("display", "none");
    $(".ticket-row").remove();
}

// Takvim
const calendar = $("#calendar")
flatpickr(calendar, {
    inline: true,
    locale: "tr",
    defaultDate: "2025-05-12",
    onChange: async function (selectedDates, dateStr, instance) {
        loadTripsList(dateStr)
    },
})
const tripCalendar = $(".trip-settings-calendar")
flatpickr(tripCalendar, {
    locale: "tr",
    defaultDate: "2025-05-12",
    onChange: async function (selectedDates, dateStr, instance) {
        const date = dateStr
        await $.ajax({
            url: "/get-trips-list",
            type: "GET",
            data: { date },
            success: function (response) {
                $(".trip-list-nodes").html(response)

                $(".trip-button").on("click", async e => {
                    const id = e.currentTarget.dataset.id
                    const time = e.currentTarget.dataset.time
                    editingTripId = id
                    // await $.ajax({
                    //     url: "/get-trip",
                    //     type: "GET",
                    //     data: { id: id, time: time },
                    //     success: async function (response) {

                    //         $(".trip").css("width", "80vw")
                    //         $(".trip-list").removeClass("col-12").addClass("col-6")
                    //         $(".trip-settings").css("display", "block")

                    //     },
                    //     error: function (xhr, status, error) {
                    //         console.log(error);
                    //     }
                    // })
                    $(".trip").css("width", "90vw")
                    $(".trip-list").removeClass("col-12").addClass("col-7")
                    $(".trip-settings").css("display", "block")
                })

                $(".blackout").css("display", "block")
                $(".trip").css("display", "block")
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        })

    },
})
const tripFirstDate = $(".trip-first-date")
flatpickr(tripFirstDate, {
    locale: "tr",
    defaultDate: "2025-05-12"
})
const tripLastDate = $(".trip-last-date")
flatpickr(tripLastDate, {
    locale: "tr",
    defaultDate: "2025-05-12"
})

let currentSeat = null;

// Boş koltuk menüsü alt menüsünü açar
$(".ticket-op").on("click", e => {
    e.stopPropagation();

    $(".ticket-op ul").css("display", "none");

    const ul = e.currentTarget.querySelector("ul");
    const isVisible = $(ul).css("display") === "flex";

    if (!isVisible) {
        $(ul).css("display", "flex");
    }
});

// Başka yere tıklandığında boş koltuk menüsü kapanır
$(document).off("click").on("click", () => {
    $(".ticket-op ul").css("display", "none");
});

$("#currentStop").on("change", async (e) => {
    const $sel = $(e.currentTarget);
    currentStop = $sel.val();                               // seçilen value
    currentStopStr = $sel.find("option:selected").text().trim(); // seçilen option'un text'i

    const response = await $.ajax({
        url: "/get-day-trips-list",
        type: "GET",
        data: { date: calendar.val(), stopId: currentStop }
    });

    $(".tripRows").html(response);
    if (currentTripId)
        loadTrip(currentTripDate, currentTripTime, currentTripId);

    $(".tripRow").on("click", async e => {
        const date = e.currentTarget.dataset.date;
        const time = e.currentTarget.dataset.time;
        const tripId = e.currentTarget.dataset.tripid;
        loadTrip(date, time, tripId);
    });
});


// Bilet kesim ekranındaki onaylama tuşu
$(".ticket-button-action").on("click", async e => {
    if (e.currentTarget.dataset.action == "sell") {
        const firstTicket = $(".ticket-row").first();
        const price = Number(firstTicket.find(".price").find("input").val());
        const span = firstTicket.find(".price").find("span.customer-point");
        const pointOrPercent = span.data("pointorpercent");
        const pointAmount = Number(span.data("pointamount") || 0);
        if ($(".ticket-rows").find(".payment").find("select").val() == "point" && pointAmount < price) {
            alert("Müşterinin puanı fiyatı karşılamıyor. Başka bir ödeme yöntemi deneyin.");
        }
        else {
            let usePointPayment = false;
            if (firstTicket.length) {
                if (pointOrPercent === "point" && pointAmount >= price) {
                    usePointPayment = $(".ticket-rows").find(".payment").find("select").val() == "point" ? true : confirm("Müşterinin puanı yeterli. Puanla mı keselim? Tamam: Puan, İptal: Para");
                    if (usePointPayment) {
                        $(".ticket-rows").find(".payment").find("select").val("point");
                    }
                }
            }

            let tickets = []

            for (let i = 0; i < selectedSeats.length; i++) {

                const ticket = $(".ticket-row")[i]

                const ticketObj = {
                    seatNumber: $(ticket).find(".seat-number").find("input").val(),
                    idNumber: $(ticket).find(".identity").find("input").val(),
                    name: $(ticket).find(".name").find("input").val(),
                    surname: $(ticket).find(".surname").find("input").val(),
                    phoneNumber: $(".ticket-rows").find(".phone").find("input").val(),
                    gender: $(ticket).find(".gender input:checked").val(),
                    nationality: $(ticket).find(".nationality").find("select").val(),
                    type: $(ticket).find(".type").find("select").val(),
                    category: $(ticket).find(".category").find("select").val(),
                    optionTime: $(".ticket-rows").find(".reservation-expire").find("input.time").val(),
                    optionDate: $(".ticket-rows").find(".reservation-expire").find("input.date").val(),
                    price: $(ticket).find(".price").find("input").val(),
                    payment: usePointPayment ? "point" : $(".ticket-rows").find(".payment").find("select").val(),
                }

                tickets.push(ticketObj)
            }

            const ticketsStr = JSON.stringify(tickets)

            await $.ajax({
                url: "/post-tickets",
                type: "POST",
                data: { pendingIds: $("#pendingIds").val(), tickets: ticketsStr, tripDate: currentTripDate, tripTime: currentTripTime, fromId: currentStop, toId, tripId: currentTripId, status: "completed" },
                success: async function (response) {
                    ticketClose()
                    loadTrip(currentTripDate, currentTripTime, currentTripId)
                },
                error: function (xhr, status, error) {
                    console.log(error);
                }
            });
        }
    }
    else if (e.currentTarget.dataset.action == "complete") {
        let tickets = []

        for (let i = 0; i < selectedTakenSeats.length; i++) {

            const ticket = $(".ticket-row")[i]

            const ticketObj = {
                seatNumber: $(ticket).find(".seat-number").find("input").val(),
                idNumber: $(ticket).find(".identity").find("input").val(),
                name: $(ticket).find(".name").find("input").val(),
                surname: $(ticket).find(".surname").find("input").val(),
                phoneNumber: $(".ticket-rows").find(".phone").find("input").val(),
                gender: $(ticket).find(".gender input:checked").val(),
                nationality: $(ticket).find(".nationality").find("select").val(),
                type: $(ticket).find(".type").find("select").val(),
                category: $(ticket).find(".category").find("select").val(),
                optionTime: $(".ticket-rows").find(".reservation-expire").find("input").val(),
                price: $(ticket).find(".price").find("input").val(),
                payment: $(".ticket-rows").find(".payment").find("select").val(),
                pnr: $(".ticket-rows").find(".pnr").find("input").val(),
            }

            tickets.push(ticketObj)
        }

        const ticketsStr = JSON.stringify(tickets)
        console.log(ticketsStr)

        await $.ajax({
            url: "/post-complete-tickets",
            type: "POST",
            data: { tickets: ticketsStr, tripDate: currentTripDate, tripTime: currentTripTime, fromId: selectedTicketStopId, groupId: currentGroupId, toId, tripId: currentTripId, status: "completed" },
            success: async function (response) {
                ticketClose()
                loadTrip(currentTripDate, currentTripTime, currentTripId)
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });

    }
    else if (e.currentTarget.dataset.action == "sell_open") {
        let tickets = []
        const fromId = $(".open-ticket-from").val()
        const toId = $(".open-ticket-to").val()

        for (let i = 0; i < $(".ticket-row").length; i++) {

            const ticket = $(".ticket-row")[i]

            const ticketObj = {
                seatNumber: $(ticket).find(".seat-number").find("input").val(),
                idNumber: $(ticket).find(".identity").find("input").val(),
                name: $(ticket).find(".name").find("input").val(),
                surname: $(ticket).find(".surname").find("input").val(),
                phoneNumber: $(".ticket-rows").find(".phone").find("input").val(),
                gender: $(ticket).find(".gender input:checked").val(),
                nationality: $(ticket).find(".nationality").find("select").val(),
                type: $(ticket).find(".type").find("select").val(),
                category: $(ticket).find(".category").find("select").val(),
                optionTime: $(".ticket-rows").find(".reservation-expire").find("input").val(),
                price: $(ticket).find(".price").find("input").val(),
                payment: $(".ticket-rows").find(".payment").find("select").val(),
            }

            tickets.push(ticketObj)
        }

        const ticketsStr = JSON.stringify(tickets)

        await $.ajax({
            url: "/post-sell-open-tickets",
            type: "POST",
            data: { tickets: ticketsStr, fromId: fromId, toId: toId, status: "open" },
            success: async function (response) {
                ticketClose()
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });

    }
    else if (e.currentTarget.dataset.action == "edit") {

        const ticket = $(".ticket-row")

        let ticketArray = []

        ticket.each((i, e) => {
            ticketArray.push({
                seatNumber: $(e).find(".seat-number").find("input").val(),
                idNumber: $(e).find(".identity").find("input").val(),
                name: $(e).find(".name").find("input").val(),
                surname: $(e).find(".surname").find("input").val(),
                phoneNumber: $(".ticket-rows").find(".phone").find("input").val(),
                gender: $(e).find(".gender input:checked").val(),
                nationality: $(e).find(".nationality").find("select").val(),
                type: $(e).find(".type").find("select").val(),
                category: $(e).find(".category").find("select").val(),
                optionTime: $(".ticket-rows").find(".reservation-expire").find("input").val(),
                price: $(e).find(".price").find("input").val(),
                pnr: $(".pnr").find("input").val(),
            })
        })


        const ticketStr = JSON.stringify(ticketArray)

        await $.ajax({
            url: "/post-edit-ticket",
            type: "POST",
            data: { tickets: ticketStr, tripDate: currentTripDate, tripTime: currentTripTime, fromId: selectedTicketStopId, toId },
            success: async function (response) {
                ticketClose()
                loadTrip(currentTripDate, currentTripTime, currentTripId)
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });
    }
    else if (e.currentTarget.dataset.action == "reservation") {
        let tickets = []

        for (let i = 0; i < selectedSeats.length; i++) {

            const ticket = $(".ticket-row")[i]

            const ticketObj = {
                seatNumber: $(ticket).find(".seat-number").find("input").val(),
                idNumber: $(ticket).find(".identity").find("input").val(),
                name: $(ticket).find(".name").find("input").val(),
                surname: $(ticket).find(".surname").find("input").val(),
                phoneNumber: $(".ticket-rows").find(".phone").find("input").val(),
                gender: $(ticket).find(".gender input:checked").val(),
                nationality: $(ticket).find(".nationality").find("select").val(),
                type: $(ticket).find(".type").find("select").val(),
                category: $(ticket).find(".category").find("select").val(),
                optionTime: $(".ticket-rows").find(".reservation-expire").find("input.time").val(),
                optionDate: $(".ticket-rows").find(".reservation-expire").find("input.date").val(),
                price: $(ticket).find(".price").find("input").val(),
            }

            tickets.push(ticketObj)
        }

        const ticketsStr = JSON.stringify(tickets)
        const pendingIds = $("#pendingIds").val()
        console.log(pendingIds)

        await $.ajax({
            url: "/post-tickets",
            type: "POST",
            data: { pendingIds, tickets: ticketsStr, tripDate: currentTripDate, tripTime: currentTripTime, fromId: currentStop, toId, tripId: currentTripId, status: "reservation" },
            success: async function (response) {
                ticketClose()
                loadTrip(currentTripDate, currentTripTime, currentTripId)
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });

    }
    else if (e.currentTarget.dataset.action == "cancel") {

        if (selectedTakenSeats.length > 0) {
            let json = JSON.stringify(selectedTakenSeats)
            await $.ajax({
                url: "/post-cancel-ticket",
                type: "POST",
                data: { seats: json, pnr: cancelingSeatPNR, date: currentTripDate, time: currentTripTime },
                success: async function (response) {
                    $(".ticket-cancel-refund-open").css("display", "none")
                    $(".blackout").css("display", "none")
                    $(".tickets").html("")
                    cancelingSeatPNR = null
                    selectedTakenSeats = []
                    $(".cancel-action-button").html(`BİLET SEÇİN`)
                    loadTrip(currentTripDate, currentTripTime, currentTripId)
                },
                error: function (xhr, status, error) {
                }
            });
        }

    }
    else if (e.currentTarget.dataset.action == "refund") {

        if (selectedTakenSeats.length > 0) {
            let json = JSON.stringify(selectedTakenSeats)
            await $.ajax({
                url: "/post-cancel-ticket",
                type: "POST",
                data: { seats: json, pnr: cancelingSeatPNR, date: currentTripDate, time: currentTripTime },
                success: async function (response) {
                    $(".ticket-cancel-refund-open").css("display", "none")
                    $(".blackout").css("display", "none")
                    $(".tickets").html("")
                    cancelingSeatPNR = null
                    selectedTakenSeats = []
                    $(".cancel-action-button").html(`BİLET SEÇİN`)
                    loadTrip(currentTripDate, currentTripTime, currentTripId)
                },
                error: function (xhr, status, error) {
                }
            });
        }

    }
    else if (e.currentTarget.dataset.action == "open") {

        if (selectedTakenSeats.length > 0) {
            let json = JSON.stringify(selectedTakenSeats)
            await $.ajax({
                url: "/post-open-ticket",
                type: "POST",
                data: { seats: json, pnr: cancelingSeatPNR, date: currentTripDate, time: currentTripTime },
                success: async function (response) {
                    $(".ticket-cancel-refund-open").css("display", "none")
                    $(".blackout").css("display", "none")
                    $(".tickets").html("")
                    cancelingSeatPNR = null
                    selectedTakenSeats = []
                    $(".cancel-action-button").html(`BİLET SEÇİN`)
                    loadTrip(currentTripDate, currentTripTime, currentTripId)
                },
                error: function (xhr, status, error) {
                }
            });
        }

    }
})

let cancelingSeatPNR = null

let isMovingActive = false
let movingSeatPNR = null
let movingSelectedSeats = []

$(".taken-ticket-op").on("click", async e => {
    const action = e.currentTarget.dataset.action
    $(".search-ticket-ops-pop-up").hide();

    if (action == "complete") {
        for (let i = 0; i < selectedTakenSeats.length; i++) {
            const seat = selectedTakenSeats[i];
            seatTypes.push($(`.seat-${seat}`).data("seat-type"))
        }

        $(".ticket-button-action").attr("data-action", "complete")
        $(".ticket-button-action").html("SAT")
        await $.ajax({
            url: "/get-ticket-row",
            type: "GET",
            data: { action: "complete", isTaken: true, seatNumbers: selectedTakenSeats, seatTypes, date: currentTripDate, time: currentTripTime, tripId: currentTripId, stopId: selectedTicketStopId },
            success: function (response) {

                $(".ticket-row").remove()
                $(".ticket-info").remove()
                $(".ticket-rows").prepend(response)
                $(".ticket-info-pop-up").css("display", "block")
                $(".blackout").css("display", "block")

                seatTypes = []

                $(".taken-ticket-ops-pop-up").hide()

                initTcknInputs(".identity input")
                initPhoneInput(".phone input")

                $(".identity input").on("blur", async e => {
                    const customer = await $.ajax({ url: "/get-customer", type: "GET", data: { idNumber: e.currentTarget.value } });
                    if (customer) {
                        const row = e.currentTarget.parentElement.parentElement
                        $(row).find(".name").find("input").val(customer.name)
                        $(row).find(".surname").find("input").val(customer.surname)
                        $(row).find(".category").find("input").val(customer.customerCategory)
                        $(row).find(".type").find("input").val(customer.customerType)
                        $(row).find(".nationality").find("input").val(customer.nationality)
                        if (customer.gender == "m") {
                            $(row).find(".gender").find("input.male").prop("checked", true)
                            $(row).find(".gender").find("input.female").prop("checked", false)
                            $(row).addClass("m").removeClass("f")
                        }
                        else {
                            $(row).find(".gender").find("input.male").prop("checked", false)
                            $(row).find(".gender").find("input.female").prop("checked", true)
                            $(row).addClass("f").removeClass("m")
                        }
                        $(".ticket-rows").find(".phone").find("input").val(customer.phoneNumber)
                    }
                })

                flatpickr($(".reservation-expire input.changable.date"), {
                    locale: "tr",
                })
                flatpickr($(".reservation-expire input.changable.time"), {
                    locale: "tr",
                    enableTime: true,
                    noCalendar: true,
                })

                $(document).on("change", ".ticket-row input[type='radio']", function () {
                    const $row = $(this).closest(".ticket-row");

                    $row.removeClass("m f");

                    if ($(this).val() === "m") {
                        $row.addClass("m");
                    } else if ($(this).val() === "f") {
                        $row.addClass("f");
                    }
                });

                $(".seat").removeClass("selected")
            },
            error: function (xhr, status, error) {
                alert(error);
            }
        });
    }

    else if (action == "edit") {
        for (let i = 0; i < selectedTakenSeats.length; i++) {
            const seat = selectedTakenSeats[i];
            seatTypes.push($(`.seat-${seat}`).data("seat-type"))
        }

        $(".ticket-button-action").attr("data-action", "edit")
        $(".ticket-button-action").html("KAYDET")
        await $.ajax({
            url: "/get-ticket-row",
            type: "GET",
            data: { action: "edit", isTaken: true, seatNumbers: selectedTakenSeats, seatTypes, date: currentTripDate, time: currentTripTime, tripId: currentTripId, stopId: selectedTicketStopId },
            success: function (response) {

                $(".ticket-row").remove()
                $(".ticket-info").remove()
                $(".ticket-rows").prepend(response)
                $(".ticket-info-pop-up").css("display", "block")
                $(".blackout").css("display", "block")

                seatTypes = []

                $(".taken-ticket-ops-pop-up").hide()

                initTcknInputs(".identity input")
                initPhoneInput(".phone input")

                $(".identity input").on("blur", async e => {
                    const customer = await $.ajax({ url: "/get-customer", type: "GET", data: { idNumber: e.currentTarget.value } });
                    if (customer) {
                        const row = e.currentTarget.parentElement.parentElement
                        $(row).find(".name").find("input").val(customer.name)
                        $(row).find(".surname").find("input").val(customer.surname)
                        $(row).find(".category").find("input").val(customer.customerCategory)
                        $(row).find(".type").find("input").val(customer.customerType)
                        $(row).find(".nationality").find("input").val(customer.nationality)
                        if (customer.gender == "m") {
                            $(row).find(".gender").find("input.male").prop("checked", true)
                            $(row).find(".gender").find("input.female").prop("checked", false)
                            $(row).addClass("m").removeClass("f")
                        }
                        else {
                            $(row).find(".gender").find("input.male").prop("checked", false)
                            $(row).find(".gender").find("input.female").prop("checked", true)
                            $(row).addClass("f").removeClass("m")
                        }
                        $(".ticket-rows").find(".phone").find("input").val(customer.phoneNumber)
                    }
                })

                flatpickr($(".reservation-expire input.changable.date"), {
                    locale: "tr",
                })
                flatpickr($(".reservation-expire input.changable.time"), {
                    locale: "tr",
                    enableTime: true,
                    noCalendar: true,
                })

                $(document).on("change", ".ticket-row input[type='radio']", function () {
                    const $row = $(this).closest(".ticket-row");

                    $row.removeClass("m f");

                    if ($(this).val() === "m") {
                        $row.addClass("m");
                    } else if ($(this).val() === "f") {
                        $row.addClass("f");
                    }
                });

                $(".seat").removeClass("selected")
            },
            error: function (xhr, status, error) {
                alert(error);
            }
        });
    }

    else if (action == "cancel") {
        $(".ticket-button-action").attr("data-action", "cancel")

        let pnr = null
        const seat = selectedTakenSeats[0];
        pnr = $(`.seat.seat-${seat}`).data("pnr")
        cancelingSeatPNR = pnr

        await $.ajax({
            url: "/get-cancel-open-ticket",
            type: "GET",
            data: { pnr: pnr, seats: selectedTakenSeats, date: currentTripDate, time: currentTripTime },
            success: function (response) {
                $(".ticket-cancel-refund-open .gtr-header span").html("BİLET İPTAL")
                $(".ticket-cancel-refund-open .tickets").prepend(response)
                $(".ticket-cancel-refund-open").css("display", "block")
                $(".blackout").css("display", "block")

                $(".taken-ticket-ops-pop-up").hide()

                selectedTakenSeats = []

                $(".ticket-cancel-box").on("click", e => {
                    if (e.currentTarget.classList.contains("selected")) {
                        e.currentTarget.classList.remove("selected")
                        selectedTakenSeats = selectedTakenSeats.filter(i => i !== e.currentTarget.dataset.seatNumber);
                        if (selectedTakenSeats > 0) {
                            $(".cancel-action-button").html(`${selectedTakenSeats.length} ADET İPTAL ET`)
                            $(".cancel-action-button").removeClass("disabled")
                        }
                        else {
                            $(".cancel-action-button").addClass("disabled")
                            $(".cancel-action-button").html(`BİLET SEÇİN`)
                        }
                        $(e.currentTarget).find(".ticket-cancel-check").css("display", "none")
                    }
                    else {
                        e.currentTarget.classList.add("selected")
                        selectedTakenSeats.push(e.currentTarget.dataset.seatNumber)
                        $(".cancel-action-button").html(`${selectedTakenSeats.length} ADET İPTAL ET`)
                        $(".cancel-action-button").removeClass("disabled")
                        $(e.currentTarget).find(".ticket-cancel-check").css("display", "block")
                    }
                })

                $(".seat").removeClass("selected")
                selectedTakenSeats = []
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });
    }

    else if (action == "refund") {
        $(".ticket-button-action").attr("data-action", "refund")

        let pnr = null
        const seat = selectedTakenSeats[0];
        pnr = $(`.seat.seat-${seat}`).data("pnr")
        cancelingSeatPNR = pnr

        await $.ajax({
            url: "/get-cancel-open-ticket",
            type: "GET",
            data: { pnr: pnr, seats: selectedTakenSeats, date: currentTripDate, time: currentTripTime },
            success: function (response) {
                $(".ticket-cancel-refund-open .gtr-header span").html("BİLET İADE")
                $(".ticket-cancel-refund-open .tickets").html(response)
                $(".ticket-cancel-refund-open").css("display", "block")
                $(".blackout").css("display", "block")

                $(".taken-ticket-ops-pop-up").hide()

                selectedTakenSeats = []

                $(".ticket-cancel-box").on("click", e => {
                    if (e.currentTarget.classList.contains("selected")) {
                        e.currentTarget.classList.remove("selected")
                        selectedTakenSeats = selectedTakenSeats.filter(i => i !== e.currentTarget.dataset.seatNumber);
                        if (selectedTakenSeats > 0) {
                            $(".cancel-action-button").html(`${selectedTakenSeats.length} ADET İADE ET`)
                            $(".cancel-action-button").removeClass("disabled")
                        }
                        else {
                            $(".cancel-action-button").addClass("disabled")
                            $(".cancel-action-button").html(`BİLET SEÇİN`)
                        }
                        $(e.currentTarget).find(".ticket-cancel-check").css("display", "none")
                    }
                    else {
                        e.currentTarget.classList.add("selected")
                        selectedTakenSeats.push(e.currentTarget.dataset.seatNumber)
                        $(".cancel-action-button").html(`${selectedTakenSeats.length} ADET İADE ET`)
                        $(".cancel-action-button").removeClass("disabled")
                        $(e.currentTarget).find(".ticket-cancel-check").css("display", "block")
                    }
                })

                $(".seat").removeClass("selected")
                selectedTakenSeats = []
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });
    }

    else if (action == "open") {
        $(".ticket-button-action").attr("data-action", "open")

        let pnr = null
        const seat = selectedTakenSeats[0];
        pnr = $(`.seat.seat-${seat}`).data("pnr")
        cancelingSeatPNR = pnr

        await $.ajax({
            url: "/get-cancel-open-ticket",
            type: "GET",
            data: { pnr: pnr, seats: selectedTakenSeats, date: currentTripDate, time: currentTripTime },
            success: function (response) {
                $(".ticket-cancel-refund-open .gtr-header span").html("BİLET AÇIĞA AL")
                $(".ticket-cancel-refund-open .tickets").html(response)
                $(".ticket-cancel-refund-open").css("display", "block")
                $(".blackout").css("display", "block")

                $(".taken-ticket-ops-pop-up").hide()

                selectedTakenSeats = []

                $(".ticket-cancel-box").on("click", e => {
                    if (e.currentTarget.classList.contains("selected")) {
                        e.currentTarget.classList.remove("selected")
                        selectedTakenSeats = selectedTakenSeats.filter(i => i !== e.currentTarget.dataset.seatNumber);
                        if (selectedTakenSeats > 0) {
                            $(".cancel-action-button").html(`${selectedTakenSeats.length} ADET AÇIĞA AL`)
                            $(".cancel-action-button").removeClass("disabled")
                        }
                        else {
                            $(".cancel-action-button").addClass("disabled")
                            $(".cancel-action-button").html(`BİLET SEÇİN`)
                        }
                        $(e.currentTarget).find(".ticket-cancel-check").css("display", "none")
                    }
                    else {
                        e.currentTarget.classList.add("selected")
                        selectedTakenSeats.push(e.currentTarget.dataset.seatNumber)
                        $(".cancel-action-button").html(`${selectedTakenSeats.length} ADET AÇIĞA AL`)
                        $(".cancel-action-button").removeClass("disabled")
                        $(e.currentTarget).find(".ticket-cancel-check").css("display", "block")
                    }
                })

                $(".seat").removeClass("selected")
                selectedTakenSeats = []
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });
    }
    else if (action == "move") {
        movingSeatPNR = $(`.seat.seat-${selectedTakenSeats[0]}`).data("pnr")
        await $.ajax({
            url: "/get-move-ticket",
            type: "GET",
            data: { pnr: movingSeatPNR, tripId: currentTripId, stopId: selectedTicketStopId },
            success: async function (response) {
                $(".moving .info").html(response)
                isMovingActive = true
                $(".taken-ticket-ops-pop-up").hide()
                $(".moving").css("display", "block")

                $(".moving-ticket-button").on("click", e => {
                    const seatNo = e.currentTarget.dataset.seatNumber

                    if (movingSelectedSeats.includes(seatNo)) {
                        e.currentTarget.classList.remove("selected")
                        e.currentTarget.classList.remove("btn-primary")
                        e.currentTarget.classList.add("btn-outline-primary")
                        movingSelectedSeats = movingSelectedSeats.filter(s => s !== seatNo)
                    }
                    else {
                        e.currentTarget.classList.add("selected")
                        e.currentTarget.classList.remove("btn-outline-primary")
                        e.currentTarget.classList.add("btn-primary")
                        movingSelectedSeats.push(seatNo)
                    }
                })
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });
    }
    else if (action == "delete_pending") {
        let pendingIds = []
        for (let i = 0; i < selectedTakenSeats.length; i++) {
            const seatNumber = selectedTakenSeats[i];
            pendingIds.push($(`.seat-${seatNumber}`).data("pending-ticket-id"))
        }
        let jsonSeats = JSON.stringify(selectedTakenSeats)
        let jsonPendingIds = JSON.stringify(pendingIds)

        await $.ajax({
            url: "/post-delete-pending-tickets",
            type: "POST",
            data: { seats: jsonSeats, pendingIds: jsonPendingIds, date: currentTripDate, time: currentTripTime, tripId: currentTripId },
            success: async function (response) {
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });
        selectedTakenSeats = []
        loadTrip(currentTripDate, currentTripTime, currentTripId)
    }
})

$(".moving-confirm").on("click", async e => {
    await $.ajax({
        url: "/post-move-tickets",
        type: "POST",
        data: { pnr: movingSeatPNR, oldSeats: JSON.stringify(movingSelectedSeats), newSeats: JSON.stringify(selectedSeats), newTrip: currentTripId, fromId: selectedTicketStopId, toId: $(".move-to-trip-place-select").val() ? $(".move-to-trip-place-select").val() : toId },
        success: async function (response) {
            selectedSeats = []
            selectedTakenSeats = []
            isMovingActive = false
            movingSeatPNR = null
            movingSelectedSeats = []
            $(".moving").css("display", "none");
            loadTrip(currentTripDate, currentTripTime, currentTripId)
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
})

$(".moving-close").on("click", e => {
    selectedSeats = []
    isMovingActive = false
    moveToTripId = null
    movingSeatPNR = null
    $(".moving").css("display", "none");
})

$(".trip-revenue-close").on("click", e => {
    $(".trip-revenue-pop-up").css("display", "none");
    $(".blackout").css("display", "none");
})

function closeTripStopRestriction() {
    if (tripStopRestrictionDirty && !confirm('Kaydedilmemiş değişiklikler var. Kapatmak istiyor musunuz?')) {
        return;
    }
    $(".trip-stop-restriction-pop-up").css("display", "none");
    $(".blackout").css("display", "none");
    tripStopRestrictionChanges = {};
    tripStopRestrictionDirty = false;
}

$(document).off("click", ".trip-stop-restriction-close").on("click", ".trip-stop-restriction-close", () => {
    closeTripStopRestriction();
});

$(".trip-staff-save").on("click", async e => {
    const data = {
        tripId: currentTripId,
        captainId: $(".trip-staff-captain").val(),
        driver2Id: $(".trip-staff-second").val(),
        driver3Id: $(".trip-staff-third").val(),
        assistantId: $(".trip-staff-assistant").val(),
        hostessId: $(".trip-staff-hostess").val()
    };
    try {
        await $.post("/post-trip-staff", data);
        await loadTrip(currentTripDate, currentTripTime, currentTripId)
        $("#captainId").val(data.captainId);
        $("#driver2Id").val(data.driver2Id);
        $("#driver3Id").val(data.driver3Id);
        $("#assistantId").val(data.assistantId);
        $("#hostessId").val(data.hostessId);
        const captain = tripStaffList.find(s => s.id == data.captainId);
        $(".captain-name").text(captain ? `${captain.name} ${captain.surname}` : "");
        $(".captain-phone").text(captain ? captain.phoneNumber : "");
        tripStaffInitial = { ...data };
        $(".trip-staff-pop-up").css("display", "none");
        $(".blackout").css("display", "none");
    } catch (err) {
        console.log(err);
    }
});

$(".trip-staff-close").on("click", e => {
    const current = {
        captainId: $(".trip-staff-captain").val() || "",
        driver2Id: $(".trip-staff-second").val() || "",
        driver3Id: $(".trip-staff-third").val() || "",
        assistantId: $(".trip-staff-assistant").val() || "",
        hostessId: $(".trip-staff-hostess").val() || ""
    };
    const changed = Object.keys(tripStaffInitial).some(k => tripStaffInitial[k] !== current[k]);
    if (changed) {
        if (!confirm("Değişiklikler kaydedilmedi. Çıkmak istiyor musunuz?")) {
            return;
        }
    }
    $(".trip-staff-pop-up").css("display", "none");
    $(".blackout").css("display", "none");
});

$(".trip-cargo-close").on("click", e => {
    e.preventDefault();
    closeTripCargoPopup();
});

$(".trip-cargo-list-close").on("click", e => {
    e.preventDefault();
    closeTripCargoListPopup();
});

$(".trip-cargo-save").on("click", async e => {
    e.preventDefault();
    if (!currentTripId) {
        showError("Sefer bilgisi bulunamadı.");
        return;
    }

    const data = {
        tripId: currentTripId,
        fromStopId: $(".trip-cargo-from").val(),
        toStopId: $(".trip-cargo-to").val(),
        senderName: ($(".trip-cargo-sender-name").val() || "").trim(),
        senderPhone: ($(".trip-cargo-sender-phone").val() || "").trim(),
        senderIdentity: ($(".trip-cargo-sender-identity").val() || "").trim(),
        description: ($(".trip-cargo-description").val() || "").trim(),
        payment: $(".trip-cargo-payment").val(),
        price: ($(".trip-cargo-price").val() || "").trim()
    };

    if (!data.fromStopId || !data.toStopId) {
        showError("Lütfen nereden ve nereye bilgilerini seçiniz.");
        return;
    }
    if (!data.senderName) {
        showError("Gönderen adını giriniz.");
        return;
    }
    if (!data.senderPhone) {
        showError("Gönderen telefonunu giriniz.");
        return;
    }
    if (!data.senderIdentity) {
        showError("Gönderen TC bilgisini giriniz.");
        return;
    }
    if (!data.payment) {
        showError("Ödeme tipini seçiniz.");
        return;
    }

    const priceValue = Number(data.price);
    if (!data.price || Number.isNaN(priceValue) || priceValue <= 0) {
        showError("Geçerli bir ücret giriniz.");
        return;
    }

    try {
        await $.post("/post-add-cargo", {
            ...data,
            price: priceValue
        });
        closeTripCargoPopup();
        await loadTrip(currentTripDate, currentTripTime, currentTripId);
    } catch (err) {
        console.log(err);
    }
});

$(".ticket-close").on("click", async e => {
    let pendingIds = $("#pendingIds").val()
    if (pendingIds) {
        let jsonSeats = JSON.stringify(selectedSeats)

        await $.ajax({
            url: "/post-delete-pending-tickets",
            type: "POST",
            data: { seats: jsonSeats, pendingIds, date: currentTripDate, time: currentTripTime, tripId: currentTripId },
            success: async function (response) {
                selectedSeats = []
                $("#pendingIds").remove()
                loadTrip(currentTripDate, currentTripTime, currentTripId)
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });
    }
    ticketClose();
})
$(".ticket-button-cancel").on("click", async e => {
    let pendingIds = $("#pendingIds").val()
    if (pendingIds) {
        let jsonSeats = JSON.stringify(selectedSeats)

        await $.ajax({
            url: "/post-delete-pending-tickets",
            type: "POST",
            data: { seats: jsonSeats, pendingIds, date: currentTripDate, time: currentTripTime, tripId: currentTripId },
            success: async function (response) {
                selectedSeats = []
                $("#pendingIds").remove()
                loadTrip(currentTripDate, currentTripTime, currentTripId)
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });
    }
    ticketClose();
})

$(".add-trip-note-button").on("click", e => {
    editingNoteId = null;
    $(".add-trip-note .gtr-header span").html("SEFERE NOT EKLE")
    $("button.save-trip-note").html("EKLE")
    $(".trip-note-text").val("");
    $(".blackout").css("display", "block")
    $(".add-trip-note").css("display", "flex")
})

$(".trip-note-close").on("click", e => {
    editingNoteId = null;
    $(".trip-note-text").val("");
    $(".blackout").css("display", "none")
    $(".add-trip-note").css("display", "none")
})

$(document).off("click", ".note-edit").on("click", ".note-edit", e => {
    const noteEl = $(e.currentTarget).closest(".note");
    editingNoteId = noteEl.data("id");
    const text = noteEl.find(".note-text").text();
    $(".add-trip-note .gtr-header span").html("NOTU DÜZENLE")
    $("button.save-trip-note").html("DÜZENLE")
    $(".trip-note-text").val(text);
    $(".blackout").css("display", "block");
    $(".add-trip-note").css("display", "flex");
})

$(document).off("click", ".note-delete").on("click", ".note-delete", async e => {
    const noteEl = $(e.currentTarget).closest(".note");
    const noteId = noteEl.data("id");
    if (confirm("Notu silmek istediğinize emin misiniz?")) {
        await $.ajax({
            url: "/post-delete-trip-note",
            type: "POST",
            data: { id: noteId },
            success: async function () {
                await $.ajax({
                    url: "/get-trip-notes",
                    type: "GET",
                    data: { date: currentTripDate, time: currentTripTime, tripId: currentTripId },
                    success: function (response) {
                        $(".trip-notes").html(response);
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                })
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        })
    }
})

$(".save-trip-note").on("click", async e => {
    if (currentTripId) {
        const text = $(".trip-note-text").val()
        if (editingNoteId) {
            await $.ajax({
                url: "/post-edit-trip-note",
                type: "POST",
                data: { id: editingNoteId, text },
                success: async function (response) {
                    await $.ajax({
                        url: "/get-trip-notes",
                        type: "GET",
                        data: { date: currentTripDate, time: currentTripTime, tripId: currentTripId },
                        success: function (response) {
                            $(".trip-notes").html(response)
                            $(".blackout").css("display", "none")
                            $(".add-trip-note").css("display", "none")
                            editingNoteId = null;
                            $(".trip-note-text").val("");
                        },
                        error: function (xhr, status, error) {
                            console.log(error);
                        }
                    })
                },
                error: function (xhr, status, error) {
                    console.log(error);
                }
            })
        } else {
            await $.ajax({
                url: "/post-trip-note",
                type: "POST",
                data: { date: currentTripDate, time: currentTripTime, tripId: currentTripId, text },
                success: async function (response) {
                    await $.ajax({
                        url: "/get-trip-notes",
                        type: "GET",
                        data: { date: currentTripDate, time: currentTripTime, tripId: currentTripId },
                        success: function (response) {
                            $(".trip-notes").html(response)
                            $(".blackout").css("display", "none")
                            $(".add-trip-note").css("display", "none")
                            $(".trip-note-text").val("");
                        },
                        error: function (xhr, status, error) {
                            console.log(error);
                        }
                    })
                },
                error: function (xhr, status, error) {
                    console.log(error);
                }
            })
        }
    }
    else {
        alert("Herhangi bir sefer seçmediniz.")
        $(".blackout").css("display", "none")
        $(".add-trip-note").css("display", "none")
    }
})

$("a.open-ticket-nav").on("click", async e => {
    const fromSelect = $(".open-ticket-from")
    const toSelect = $(".open-ticket-to")
    fromSelect.empty()
    toSelect.empty()
    await $.ajax({
        url: "/get-stops-data",
        type: "GET",
        success: function (stops) {
            fromSelect.append(`<option value="" selected>Seçiniz</option>`)
            toSelect.append(`<option value="" selected>Seçiniz</option>`)
            stops.forEach(s => {
                fromSelect.append(`<option value="${s.id}">${s.title}</option>`)
                toSelect.append(`<option value="${s.id}">${s.title}</option>`)
            })
        },
        error: function (xhr, status, error) {
            console.log(error)
        }
    })
    $(".open-ticket-sale").css("display", "block")
    $(".blackout").css("display", "block")
})

$(".open-ticket-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".open-ticket-sale").css("display", "none")
})

$(".open-ticket-next").on("click", async e => {
    const fromId = $(".open-ticket-from").val()
    const toId = $(".open-ticket-to").val()
    const count = $(".open-ticket-count").val()

    await $.ajax({
        url: "/get-ticket-row",
        type: "GET",
        data: { fromId, toId, count, isOpen: true, action: "sell" },
        success: function (response) {
            $(".ticket-row").remove()
            $(".ticket-info").remove()
            $(".ticket-rows").prepend(response)
            initTcknInputs(".identity input")
            initPhoneInput(".phone input")
            $(".identity input").on("blur", async e => {
                const customer = await $.ajax({ url: "/get-customer", type: "GET", data: { idNumber: e.currentTarget.value } });
                if (customer) {
                    const row = e.currentTarget.parentElement.parentElement
                    $(row).find(".name").find("input").val(customer.name)
                    $(row).find(".surname").find("input").val(customer.surname)
                    $(row).find(".category").find("input").val(customer.customerCategory)
                    $(row).find(".type").find("input").val(customer.customerType)
                    $(row).find(".nationality").find("input").val(customer.nationality)
                    if (customer.gender == "m") {
                        $(row).find(".gender").find("input.male").prop("checked", true)
                        $(row).find(".gender").find("input.female").prop("checked", false)
                        $(row).addClass("m").removeClass("f")
                    }
                    else {
                        $(row).find(".gender").find("input.male").prop("checked", false)
                        $(row).find(".gender").find("input.female").prop("checked", true)
                        $(row).addClass("f").removeClass("m")
                    }
                    $(".ticket-rows").find(".phone").find("input").val(customer.phoneNumber)
                }
            })
            $(".open-ticket-sale").css("display", "none")
            $(".ticket-info-pop-up_from").html($(`.open-ticket-from option[value=${fromId}]`).text().toLocaleUpperCase())
            $(".ticket-info-pop-up_to").html($(`.open-ticket-from option[value=${toId}]`).text().toLocaleUpperCase())
            $(".ticket-header--date").html("AÇIK BİLET")
            $(".ticket-button-action").attr("data-action", "sell_open")
            $(".ticket-button-action").html("AÇIK SAT")
            $(".ticket-info-pop-up").css("display", "block")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
})

$("a.ticket-search").on("click", e => {
    $(".ticket-search-pop-up").css("display", "block")
    $(".blackout").css("display", "block")
})

$(".ticket-search-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".ticket-search-pop-up").css("display", "none")
})

$(".ticket-search-button").on("click", async e => {
    const name = $(".search-name").val()
    const surname = $(".search-surname").val()
    const idnum = $(".search-idnum").val()
    const phone = $(".search-phone").val()
    const pnr = $(".search-pnr").val()
    const status = $(".search-status").val()

    await $.ajax({
        url: "/get-search-table",
        type: "GET",
        data: { name, surname, idnum, phone, pnr, status },
        success: function (response) {
            $(".searched-table").html(response)
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(document).off("click", ".searched-table tbody tr").on("click", ".searched-table tbody tr", function (e) {
    const $row = $(this);
    selectedTakenSeats = [$row.data("seat-number")];
    currentGroupId = $row.data("group-id");
    selectedTicketStopId = $row.data("stop-id");
    currentTripId = $row.data("trip-id");
    currentTripDate = $row.data("trip-date");
    currentTripTime = $row.data("trip-time");

    updateTakenTicketOpsVisibility($row);

    const rect = this.getBoundingClientRect();
    const $popup = $(".search-ticket-ops-pop-up");

    // Popup'ı mouse konumuna yerleştir
    let left = e.pageX + 10;
    let top = e.pageY + 10;

    const popupWidth = $popup.outerWidth();
    const popupHeight = $popup.outerHeight();
    const viewportWidth = $(window).width();
    const viewportHeight = $(window).height();

    // Sağ kenarı taşmasın
    if (left + popupWidth > viewportWidth) {
        left = e.pageX - popupWidth - 10;
        if (left < 0) left = 0;
    }

    // Alt kenarı taşmasın
    if (top + popupHeight > $(window).scrollTop() + viewportHeight) {
        top = e.pageY - popupHeight - 10;
        if (top < 0) top = 0;
    }
    $popup.css({ left: left + "px", top: top + "px", display: "block" });
});

$(document).off("click", ".searched-ticket-op[data-action='go_trip']").on("click", ".searched-ticket-op[data-action='go_trip']", async e => {
    $(".search-ticket-ops-pop-up").hide();
    await loadTrip(currentTripDate, currentTripTime, currentTripId);
});

let isRegisterShown = false
$(".register-nav").on("click", async e => {
    await $.ajax({
        url: "/get-transactions-list",
        type: "GET",
        data: {},
        success: async function (response) {
            $(".transaction-list").html(response)

            await $.ajax({
                url: "/get-transaction-data",
                type: "GET",
                data: {},
                success: function (response) {
                    const cashSales = Number(response.cashSales) || 0;
                    const cardSales = Number(response.cardSales) || 0;
                    const cashRefund = Number(response.cashRefund) || 0;
                    const cardRefund = Number(response.cardRefund) || 0;
                    const transferIn = Number(response.transferIn) || 0;
                    const transferOut = Number(response.transferOut) || 0;
                    const payedToBus = Number(response.payedToBus) || 0;
                    const otherIn = Number(response.otherIn) || 0;
                    const otherOut = Number(response.otherOut) || 0;
                    const inSum = cashSales + cardSales + transferIn + otherIn
                    const outSum = cashRefund + cardRefund + payedToBus + transferOut + otherOut
                    const balance = inSum - outSum
                    $(".balance").val(balance)
                    $(".card-balance").val(Number(response.card_balance))
                    $(".cash-balance").val(Number(response.cash_balance))
                    $(".income-summary").val(inSum)
                    $(".expense-summary").val(outSum)
                    $(".cash-sales").val(cashSales)
                    $(".card-sales").val(cardSales)
                    $(".sales-summary").val(cardSales + cashSales)
                    $(".transferred-income").val(transferIn)
                    $(".other-income").val(otherIn)
                    $(".cash-refund").val(cashRefund)
                    $(".card-refund").val(cardRefund)
                    $(".refund-summary").val(cardRefund + cashRefund)
                    $(".payed-to-bus").val(payedToBus)
                    $(".other-expense").val(otherOut + transferOut)
                    $(".blackout").css("display", "block")
                    $(".register").css("display", "block")
                    isRegisterShown = true
                },
                error: function (xhr, status, error) {
                    console.log(error);
                }
            })
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".register-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".register").css("display", "none")
    isRegisterShown = false
})

$(".other-register-nav").on("click", async e => {
    $(".blackout").css("display", "block")
    $(".other-register").css("display", "block")
    $(".other-register-user").empty()
    $(".other-register-balance").val("")
    $(".other-transaction-list").empty()

    const branchSelect = $(".other-register-branch")
    branchSelect.empty()
    await $.ajax({
        url: "/get-branches-list",
        type: "GET",
        data: { onlyData: true },
        success: function (branches) {
            branchSelect.append(`<option value="">Şube Seç</option>`)
            branches.forEach(b => {
                branchSelect.append(`<option value="${b.id}">${b.title}</option>`)
            })
        },
        error: function (xhr, status, error) {
            console.log(error)
        }
    })
})

$(".other-register-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".other-register").css("display", "none")
})

$(".other-register-branch").on("change", async e => {
    const branchId = $(e.target).val()
    const userSelect = $(".other-register-user")
    userSelect.empty()
    $(".other-register-balance").val("")
    $(".other-transaction-list").empty()
    if (branchId) {
        await $.ajax({
            url: "/get-users-by-branch",
            type: "GET",
            data: { id: branchId },
            success: function (response) {
                userSelect.append(`<option value="">Kullanıcı Seç</option>`)
                response.forEach(u => {
                    userSelect.append(`<option value="${u.id}">${u.name}</option>`)
                })
            }
        })
    }
})

$(".other-register-user").on("change", async e => {
    const userId = $(e.target).val()
    $(".other-register-balance").val("")
    $(".other-transaction-list").empty()
    if (userId) {
        await $.ajax({
            url: "/get-user-register-balance",
            type: "GET",
            data: { userId },
            success: function (response) {
                $(".other-register-balance").val(response.balance)
            }
        })
        await $.ajax({
            url: "/get-transactions-list",
            type: "GET",
            data: { userId },
            success: function (response) {
                $(".other-transaction-list").html(response)
            }
        })
    }
})

let transactionType = null
$(".add-income-nav").on("click", async e => {
    transactionType = "income"
    $(".add-transaction").css("display", "block")
    $(".register").css("z-index", 9)
    $(".blackout").css("display", "block")
})

$(".add-expense-nav").on("click", async e => {
    transactionType = "expense"
    $(".add-transaction").css("display", "block")
    $(".blackout").css("display", "block")
    $(".register").css("z-index", 9)
})

$(".add-transaction-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".add-transaction").css("display", "none")
})

$(".add-transaction-button").on("click", async e => {
    const amount = $(".transaction-amount").val()
    const description = $(".transaction-description").val()
    await $.ajax({
        url: "/post-add-transaction",
        type: "POST",
        data: { transactionType, amount, description },
        success: async function (response) {
            console.log("asdasd")
            transactionType = null
            $(".add-transaction").css("display", "none")
            $(".register").css("z-index", 100)
            if (!isRegisterShown)
                $(".blackout").css("display", "none")
            if (isRegisterShown) {
                await $.ajax({
                    url: "/get-transactions-list",
                    type: "GET",
                    data: {},
                    success: async function (response) {
                        $(".transaction-list").html(response)

                        await $.ajax({
                            url: "/get-transaction-data",
                            type: "GET",
                            data: {},
                            success: function (response) {
                                const cashSales = Number(response.cashSales) || 0;
                                const cardSales = Number(response.cardSales) || 0;
                                const cashRefund = Number(response.cashRefund) || 0;
                                const cardRefund = Number(response.cardRefund) || 0;
                                const transferIn = Number(response.transferIn) || 0;
                                const transferOut = Number(response.transferOut) || 0;
                                const payedToBus = Number(response.payedToBus) || 0;
                                const otherIn = Number(response.otherIn) || 0;
                                const otherOut = Number(response.otherOut) || 0;
                                const inSum = cashSales + cardSales + transferIn + otherIn
                                const outSum = cashRefund + cardRefund + payedToBus + transferOut + otherOut
                                const balance = inSum - outSum
                                console.log(response)
                                console.log(inSum)
                                console.log(outSum)
                                console.log(balance)
                                $(".balance").val(balance)
                                $(".income-summary").val(inSum)
                                $(".expense-summary").val(outSum)
                                $(".cash-sales").val(cashSales)
                                $(".card-sales").val(cardSales)
                                $(".sales-summary").val(cardSales + cashSales)
                                $(".transferred-income").val(transferIn)
                                $(".other-income").val(otherIn)
                                $(".cash-refund").val(cashRefund)
                                $(".card-refund").val(cardRefund)
                                $(".refund-summary").val(cardRefund + cashRefund)
                                $(".payed-to-bus").val(payedToBus)
                                $(".other-expense").val(otherOut + transferOut)
                                $(".blackout").css("display", "block")
                                $(".register").css("display", "block")
                                isRegisterShown = true
                            },
                            error: function (xhr, status, error) {
                                console.log(error);
                            }
                        })
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                })
            }
        },
        error: function (xhr, status, error) {
            const message = xhr.responseJSON?.message || error;
            console.log(message);
        }
    })
})

$(".bus-plans-nav").on("click", async e => {
    const list = $(".bus-plan-list")
    list.empty()
    await $.ajax({
        url: "/get-bus-models-data",
        type: "GET",
        success: function (busModels) {
            busModels.forEach(b => {
                list.append(`<button class=\"btn btn-outline-primary bus-plan-button d-flex w-100\" data-id=\"${b.id}\"><div class=\"col-6\"><p class=\"text-center mb-0\">${b.title}</p></div><div class=\"col-6\"><p class=\"text-center mb-0\">${b.description}</p></div></button>`)
            })
        },
        error: function (xhr, status, error) {
            console.log(error)
        }
    })
    $(".bus-plans").css("display", "block")
    $(".blackout").css("display", "block")
})

$(".bus-plans-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".bus-plans").css("display", "none")
})

let editingBusPlanId = null
$(document).off("click", ".bus-plan-button").on("click", ".bus-plan-button", async e => {
    const id = e.currentTarget.dataset.id
    editingBusPlanId = id

    await $.ajax({
        url: "/get-bus-plan-panel",
        type: "GET",
        data: { id: id },
        success: function (response) {
            $(".bus-plan-panel").html(response)

            $(".bus-plan-create-input").on("input", e => {
                if (e.currentTarget.value > 0 && e.currentTarget.value < 81) {
                    e.currentTarget.className = "bus-plan-create-input taken"
                }
                else if (e.currentTarget.value == ">") {
                    e.currentTarget.value = ">"
                    e.currentTarget.className = "bus-plan-create-input doors"
                }
                else if (e.currentTarget.value == "ş" || e.currentTarget.value == "Ş") {
                    e.currentTarget.value = "Ş"
                    e.currentTarget.className = "bus-plan-create-input captain"
                }
                else {
                    e.currentTarget.value = ""
                    e.currentTarget.className = "bus-plan-create-input"
                }
            })

            $(".save-bus-plan").on("click", async e => {
                const title = $(".bus-plan-title").val()
                const description = $(".bus-plan-description").val()

                let plan = []
                let planBinary = ""
                $(".bus-plan-create-input").each((i, e) => {
                    plan.push(e.value ? e.value : 0)
                    if (e.value && e.value !== "Ş" && e.value !== ">") {
                        planBinary = `${planBinary}${1}`
                    }
                    else {
                        planBinary = `${planBinary}${0}`
                    }
                })

                console.log(plan)
                console.log(planBinary)

                const planJSON = JSON.stringify(plan)

                await $.ajax({
                    url: "/post-save-bus-plan",
                    type: "POST",
                    data: { id, title, description, plan: planJSON, planBinary },
                    success: function (response) {
                        $(".bus-plans").css("display", "none")
                        $(".blackout").css("display", "none")

                        $(".bus-plan-panel").html("")
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                })
            })
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".add-bus-plan").on("click", async e => {
    editingBusPlanId = null
    await $.ajax({
        url: "/get-bus-plan-panel",
        type: "GET",
        data: {},
        success: function (response) {
            $(".bus-plan-panel").html(response)

            $(".bus-plan-create-input").on("input", e => {
                if (e.currentTarget.value > 0 && e.currentTarget.value < 81) {
                    e.currentTarget.className = "bus-plan-create-input taken"
                }
                else if (e.currentTarget.value == ">") {
                    e.currentTarget.value = ">"
                    e.currentTarget.className = "bus-plan-create-input doors"
                }
                else if (e.currentTarget.value == "ş" || e.currentTarget.value == "Ş") {
                    e.currentTarget.value = "Ş"
                    e.currentTarget.className = "bus-plan-create-input captain"
                }
                else {
                    e.currentTarget.value = ""
                    e.currentTarget.className = "bus-plan-create-input"
                }
            })

            $(".save-bus-plan").on("click", async e => {
                const title = $(".bus-plan-title").val()
                const description = $(".bus-plan-description").val()

                let plan = []
                let planBinary = ""
                $(".bus-plan-create-input").each((i, e) => {
                    plan.push(e.value ? e.value : 0)
                    if (e.value && e.value !== "Ş" && e.value !== ">") {
                        planBinary = `${planBinary}${1}`
                    }
                    else {
                        planBinary = `${planBinary}${0}`
                    }
                })

                console.log(plan)
                console.log(planBinary)

                const planJSON = JSON.stringify(plan)

                await $.ajax({
                    url: "/post-save-bus-plan",
                    type: "POST",
                    data: { title, description, plan: planJSON, planBinary },
                    success: function (response) {
                        $(".bus-plans").css("display", "none")
                        $(".blackout").css("display", "none")

                        $(".bus-plan-panel").html("")
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                })
            })
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

let editingBusId = null
$(".bus-nav").on("click", async e => {
    const modelSelect = $(".bus-bus-model")
    const captainSelect = $(".bus-captain")
    modelSelect.empty()
    captainSelect.empty()

    await $.ajax({
        url: "/get-bus-models-data",
        type: "GET",
        success: function (models) {
            modelSelect.append(`<option value="" selected></option>`)
            models.forEach(b => {
                modelSelect.append(`<option value="${b.id}">${b.title}</option>`)
            })
        }
    })

    await $.ajax({
        url: "/get-staffs-list",
        type: "GET",
        data: { onlyData: true },
        success: function (staff) {
            captainSelect.append(`<option value="" selected></option>`)
            staff.filter(s => s.duty === "driver").forEach(s => {
                captainSelect.append(`<option value="${s.id}">${s.name} ${s.surname}</option>`)
            })
        }
    })

    await $.ajax({
        url: "/get-buses-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".bus-list-nodes").html(response)

            $(".bus-button").on("click", async e => {
                const id = e.currentTarget.dataset.id
                const licensePlate = e.currentTarget.dataset.licensePlate
                editingBusId = id
                await $.ajax({
                    url: "/get-bus",
                    type: "GET",
                    data: { id: id, licensePlate: licensePlate },
                    success: function (response) {
                        $(".bus-license-plate").val(response.licensePlate)
                        $(".bus-bus-model").val(response.busModelId)
                        $(".bus-captain").val(response.captainId)
                        $(".bus-phone").val(response.phoneNumber)
                        $(".bus-owner").val(response.owner)
                        $(".bus").css("width", "75vw")
                        $(".bus-list").removeClass("col-12").addClass("col-4")
                        $(".bus-info").css("display", "flex")
                        $(".bus-settings").css("display", "block")
                        $(".save-bus").html("KAYDET")
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                })
            })

            $(".blackout").css("display", "block")
            $(".bus").css("display", "block")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })

    $(".bus").css("display", "block")
    $(".blackout").css("display", "block")
})

$(".bus-close").on("click", e => {
    $(".bus").css("width", "30vw")
    $(".bus-list").addClass("col-12").removeClass("col-4")
    $(".bus-info").css("display", "none")
    $(".bus-settings").css("display", "none")
    $(".blackout").css("display", "none")
    $(".bus").css("display", "none")
})

$(".add-bus").on("click", e => {
    $(".bus-license-plate").val("")
    $(".bus-bus-model").val("")
    $(".bus-captain").val("")
    $(".bus-phone").val("")
    $(".bus-owner").val("")
    editingBusId = null
    $(".bus").css("width", "75vw")
    $(".bus-list").removeClass("col-12").addClass("col-4")
    $(".bus-info").css("display", "flex")
    $(".bus-settings").css("display", "block")
    $(".save-bus").html("EKLE")
})

$(".save-bus").on("click", async e => {
    const licensePlate = $(".bus-license-plate").val()
    const busModelId = $(".bus-bus-model").val()
    const captainId = $(".bus-captain").val()
    const phoneNumber = $(".bus-phone").val()
    const owner = $(".bus-owner").val()

    await $.ajax({
        url: "/post-save-bus",
        type: "POST",
        data: { id: editingBusId, licensePlate, busModelId, captainId, phoneNumber, owner },
        success: function (response) {
            $(".bus-license-plate").val("")
            $(".bus-bus-model").val("")
            $(".bus-captain").val("")
            $(".bus-phone").val("")
            $(".bus-owner").val("")
            editingBusId = null
            $(".bus").css("width", "30vw")
            $(".bus-list").addClass("col-12").removeClass("col-4")
            $(".bus-info").css("display", "none")
            $(".bus-settings").css("display", "none")
            $(".blackout").css("display", "none")
            $(".bus").css("display", "none")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

let editingStaffId = null
$(".staff-nav").on("click", async e => {
    await $.ajax({
        url: "/get-staffs-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".staff-list-nodes").html(response)

            $(".staff-button").on("click", async e => {
                const id = e.currentTarget.dataset.id
                editingStaffId = id
                await $.ajax({
                    url: "/get-staff",
                    type: "GET",
                    data: { id },
                    success: function (res) {
                        $(".staff-id-number").val(res.idNumber)
                        $(".staff-duty").val(res.duty)
                        $(".staff-name").val(res.name)
                        $(".staff-surname").val(res.surname)
                        $(".staff-address").val(res.address)
                        $(".staff-phone").val(res.phoneNumber)
                        $(`input[name='staff-gender'][value='${res.gender}']`).prop("checked", true)
                        $(".staff-nationality").val(res.nationality)
                        $(".staff-panel").css("display", "flex")
                        $(".save-staff").html("KAYDET")
                    },
                    error: function (xhr, status, error) {
                        console.log(error)
                    }
                })
            })

            $(".blackout").css("display", "block")
            $(".staff").css("display", "block")
        },
        error: function (xhr, status, error) {
            console.log(error)
        }
    })
})

$(".staff-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".staff").css("display", "none")
    $(".staff-panel").css("display", "none")
})

$(".add-staff").on("click", e => {
    $(".staff-id-number").val("")
    $(".staff-duty").val("")
    $(".staff-name").val("")
    $(".staff-surname").val("")
    $(".staff-address").val("")
    $(".staff-phone").val("")
    $("input[name='staff-gender']").prop("checked", false)
    $(".staff-nationality").val("")
    editingStaffId = null
    $(".staff-panel").css("display", "flex")
    $(".save-staff").html("EKLE")
})

$(".save-staff").on("click", async e => {
    const idNumber = $(".staff-id-number").val()
    const duty = $(".staff-duty").val()
    const name = $(".staff-name").val()
    const surname = $(".staff-surname").val()
    const address = $(".staff-address").val()
    const phoneNumber = $(".staff-phone").val()
    const gender = $("input[name='staff-gender']:checked").val()
    const nationality = $(".staff-nationality").val()

    await $.ajax({
        url: "/post-save-staff",
        type: "POST",
        data: { id: editingStaffId, idNumber, duty, name, surname, address, phoneNumber, gender, nationality },
        success: function (response) {
            $(".staff-panel").css("display", "none")
            $(".blackout").css("display", "none")
            $(".staff").css("display", "none")
        },
        error: function (xhr, status, error) {
            console.log(error)
        }
    })
})

let editingStopId = null
$(".stops-nav").on("click", async e => {
    const placeSelect = $(".stop-place")
    placeSelect.empty()
    await $.ajax({
        url: "/get-places-data",
        type: "GET",
        success: function (places) {
            placeSelect.append(`<option value="" selected></option>`)
            places.forEach(p => {
                placeSelect.append(`<option value="${p.id}">${p.title}</option>`)
            })
        },
        error: function (xhr, status, error) {
            console.log(error)
        }
    })

    await $.ajax({
        url: "/get-stops-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".stop-list-nodes").html(response)

            $(".stop-button").on("click", async e => {
                const id = e.currentTarget.dataset.id
                editingStopId = id
                await $.ajax({
                    url: "/get-stop",
                    type: "GET",
                    data: { id },
                    success: function (response) {
                        $(".stop-title").val(response.title)
                        $(".stop-web-title").val(response.webTitle)
                        $(".stop-place").val(response.placeId)
                        $(".stop-uetds").val(response.UETDS_code)
                        $(".stop-service").prop("checked", response.isServiceArea)
                        $(".stop-active").prop("checked", response.isActive)
                        $(".stop-panel").css("display", "flex")
                        $(".save-stop").html("KAYDET")
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                })
            })

            $(".blackout").css("display", "block")
            $(".stops").css("display", "block")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".stops-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".stops").css("display", "none")
    $(".stop-panel").css("display", "none")
})

$(".add-stop").on("click", e => {
    $(".stop-title").val("")
    $(".stop-web-title").val("")
    $(".stop-place").val("")
    $(".stop-uetds").val("")
    $(".stop-service").prop("checked", false)
    $(".stop-active").prop("checked", true)
    editingStopId = null
    $(".stop-panel").css("display", "flex")
    $(".save-stop").html("EKLE")
})

$(".save-stop").on("click", async e => {
    const title = $(".stop-title").val()
    const webTitle = $(".stop-web-title").val()
    const placeId = $(".stop-place").val()
    const UETDS_code = $(".stop-uetds").val()
    const isServiceArea = $(".stop-service").is(":checked")
    const isActive = $(".stop-active").is(":checked")

    await $.ajax({
        url: "/post-save-stop",
        type: "POST",
        data: { id: editingStopId, title, webTitle, placeId, UETDS_code, isServiceArea, isActive },
        success: function (response) {
            $(".stop-panel").css("display", "none")
            $(".blackout").css("display", "none")
            $(".stops").css("display", "none")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

let editingRouteId = null
let routeStops = []
$(".route-nav").on("click", async e => {
    routeStops = []
    await $.ajax({
        url: "/get-routes-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".route-list-nodes").html(response)

            $.ajax({
                url: "/get-stops-data",
                type: "GET",
                success: function (stops) {
                    const opts = ['<option value="" selected></option>']
                    for (const s of stops) {
                        opts.push(`<option value="${s.id}">${s.title}</option>`)
                    }
                    $(".route-from, .route-to, .route-stop-place").html(opts.join(""))
                },
                error: function (xhr, status, error) {
                    console.log(error)
                }
            })

            $(".route-button").on("click", async e => {
                const id = e.currentTarget.dataset.id
                const title = e.currentTarget.dataset.title
                editingRouteId = id
                await $.ajax({
                    url: "/get-route",
                    type: "GET",
                    data: { id: id, title: title },
                    success: async function (response) {

                        $(".route-code").val(response.routeCode)
                        $(".route-title").val(response.title)
                        $(".route-from").val(response.fromStopId)
                        $(".route-to").val(response.toStopId)
                        $(".route-description").val(response.description)

                        await $.ajax({
                            url: "/get-route-stops-list",
                            type: "GET",
                            data: { id },
                            success: function (response) {
                                $(".route-stops").html(response)

                                $(".route").css("width", "80vw")
                                $(".route-list").removeClass("col-12").addClass("col-4")
                                $(".route-info").css("display", "flex")
                                $(".route-settings").css("display", "block")
                                $(".save-route").html("EKLE")
                            },
                            error: function (xhr, status, error) {
                                console.log(error);
                            }
                        })

                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                })
            })

            $(".blackout").css("display", "block")
            $(".route").css("display", "block")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".route-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".route").css("display", "none")
})

$(".add-route").on("click", e => {
    $(".route-code").val("")
    $(".route-title").val("")
    $(".route-from").val("")
    $(".route-to").val("")
    $(".route-description").val("")
    $(".route-stops").html("")
    editingRouteId = null
    $(".route").css("width", "80vw")
    $(".route-list").removeClass("col-12").addClass("col-4")
    $(".route-info").css("display", "flex")
    $(".route-settings").css("display", "block")
    $(".save-route").html("EKLE")
})

const timeInput = document.querySelector(".route-stop-duration");

// Yazarken 2 haneden sonra ":" ekle
timeInput.addEventListener("input", () => {
    let val = timeInput.value.replace(/[^0-9]/g, ""); // sadece rakam
    if (val.length >= 3) {
        val = val.slice(0, 2) + ":" + val.slice(2, 4);
    }
    timeInput.value = val;
});

// Odak kaybedince kontrol et
timeInput.addEventListener("blur", () => {
    let value = timeInput.value;

    if (!value.includes(":")) return (timeInput.value = "");

    let [hh, mm] = value.split(":").map(v => parseInt(v, 10));

    if (isNaN(hh) || isNaN(mm)) {
        timeInput.value = "";
        return;
    }

    // Saat aralığını düzelt
    if (hh < 0) hh = 0;
    if (hh > 23) hh = 23;

    // Dakika aralığını düzelt
    if (mm < 0) mm = 0;
    if (mm > 59) mm = 59;

    // Tek haneli saat/dakika başına 0 koy
    timeInput.value = `${hh.toString().padStart(2, "0")}:${mm
        .toString()
        .padStart(2, "0")}`;
});

$(".add-route-stop-button").on("click", async e => {
    const stopId = $(".route-stop-place").val()
    const duration = $(".route-stop-duration").val()
    const isFirst = routeStops.length == 0

    if (stopId)
        await $.ajax({
            url: "/get-route-stop",
            type: "GET",
            data: { stopId, duration, isFirst },
            success: function (response) {
                $(".route-stop-duration").css("display", "block")
                $(".route-stop-place").val("")
                $(".route-stop-duration").val("")
                routeStops.push({ stopId, duration })
                $(".route-stops").append(response)

                const timeInput = document.querySelector(".duration-input");

                if (timeInput) {
                    // Yazarken 2 haneden sonra ":" ekle
                    timeInput.addEventListener("input", () => {
                        let val = timeInput.value.replace(/[^0-9]/g, ""); // sadece rakam
                        if (val.length >= 3) {
                            val = val.slice(0, 2) + ":" + val.slice(2, 4);
                        }
                        timeInput.value = val;
                    });

                    // Odak kaybedince kontrol et
                    timeInput.addEventListener("blur", () => {
                        let value = timeInput.value;

                        if (!value.includes(":")) return (timeInput.value = "");

                        let [hh, mm] = value.split(":").map(v => parseInt(v, 10));

                        if (isNaN(hh) || isNaN(mm)) {
                            timeInput.value = "";
                            return;
                        }

                        // Saat aralığını düzelt
                        if (hh < 0) hh = 0;
                        if (hh > 23) hh = 23;

                        // Dakika aralığını düzelt
                        if (mm < 0) mm = 0;
                        if (mm > 59) mm = 59;

                        // Tek haneli saat/dakika başına 0 koy
                        timeInput.value = `${hh.toString().padStart(2, "0")}:${mm
                            .toString()
                            .padStart(2, "0")}`;
                    });
                }

                $(".remove-route-stop").on("click", e => {
                    const $stop = $(e.currentTarget).closest(".route-stop");
                    const stopId = $stop.data("stopId");

                    if ($stop[0] === $(".route-stop")[0]) {
                        $(".route-stop").eq(1).find("._route-stop-duration").remove();
                    }

                    console.log($stop)
                    $stop.remove();

                    routeStops = routeStops.filter(r => r.stopId !== stopId);
                });

            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        })
})

$(".save-route").on("click", async e => {
    const routeCode = $(".route-code").val()
    const routeTitle = $(".route-title").val()
    const routeFrom = $(".route-from").val()
    const routeTo = $(".route-to").val()
    const routeDescription = $(".route-description").val()
    const routeStopsSTR = JSON.stringify(routeStops)

    await $.ajax({
        url: "/post-save-route",
        type: "POST",
        data: { id: editingRouteId, routeCode, routeDescription, routeTitle, routeFrom, routeTo, routeStopsSTR },
        success: function (response) {
            editingRouteId = null
            $(".route-code").val("")
            $(".route-title").val("")
            $(".route-from").val("")
            $(".route-to").val("")
            $(".route-description").val("")
            routeStops = []
            $(".blackout").css("display", "none")
            $(".route").css("display", "none")
            $(".route-info").css("display", "none")
            $(".route-settings").css("display", "none")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

let editingTripId = null
$(".trip-nav").on("click", async e => {
    const date = $(".trip-settings-calendar").val()
    await $.ajax({
        url: "/get-trips-list",
        type: "GET",
        data: { date },
        success: function (response) {
            $(".trip-list-nodes").html(response)

            $(".trip-button").on("click", async e => {
                const id = e.currentTarget.dataset.id
                const time = e.currentTarget.dataset.time
                editingTripId = id
                // await $.ajax({
                //     url: "/get-trip",
                //     type: "GET",
                //     data: { id: id, time: time },
                //     success: async function (response) {

                //         $(".trip").css("width", "80vw")
                //         $(".trip-list").removeClass("col-12").addClass("col-6")
                //         $(".trip-settings").css("display", "block")

                //     },
                //     error: function (xhr, status, error) {
                //         console.log(error);
                //     }
                // })
                $(".trip").css("width", "90vw")
                $(".trip-list").removeClass("col-12").addClass("col-7")
                $(".trip-settings").css("display", "block")
            })

            $(".blackout").css("display", "block")
            $(".trip").css("display", "block")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

let priceStops = [];

const resetPriceAddRow = () => {
    const row = $(".price-add-row");
    const selects = row.find("select");
    selects.each(function () {
        let options = '<option value="">Seçiniz</option>';
        priceStops.forEach(pl => {
            options += `<option value="${pl.id}">${pl.title}</option>`;
        });
        $(this).html(options);
    });
    row.find("input").val("");
    flatpickr(row.find(".date-picker").toArray(), { dateFormat: "Y-m-d" });
};

$(".price-nav").on("click", async e => {
    await $.ajax({
        url: "/get-prices-list",
        type: "GET",
        success: function (response) {
            $(".price-list-nodes").html(response);
            const stopsData = $("#price-stops-data").text();
            priceStops = stopsData ? JSON.parse(stopsData) : [];
            $("#price-stops-data").remove();
            $(".prices").css("display", "block");
            $(".blackout").css("display", "block");
        },
        error: function (xhr, status, error) {
            console.log(error)
        }
    })
})

$(".price-close").on("click", e => {
    if ($(".price-list-nodes .price-button-inputs").length) {
        const confirmClose = confirm("Kaydedilmemiş değişiklikler var. Kapatmak istediğinize emin misiniz?");
        if (!confirmClose) return;
    }
    $(".prices").css("display", "none");
    $(".blackout").css("display", "none");
})

$(document).off("click", ".price-list-nodes .d-flex.btn, .price-add-row").on("click", ".price-list-nodes .d-flex.btn, .price-add-row", function () {
    const row = $(this);
    if (row.hasClass("price-button-inputs")) return;
    row.removeClass("btn-outline-primary").addClass("btn-primary price-button-inputs");
    row.children(".col").each(function (index) {
        const p = $(this).find("p");
        if (!p.length) return;
        const value = p.data("value") ?? p.text().trim();
        if (index === 0 || index === 1) {
            let select = '<select class="price-button-select">';
            priceStops.forEach(pl => {
                select += `<option value="${pl.id}" ${pl.id == value ? 'selected' : ''}>${pl.title}</option>`;
            });
            select += '</select>';
            p.replaceWith(select);
        } else {
            let cls = "price-button-input";
            let type = "text";
            if (index === 11) { cls += " hour-limit"; type = "number"; }
            if (index === 12 || index === 13) cls += " date-picker";
            p.replaceWith(`<input class="${cls}" type="${type}" value="${value ?? ''}">`);
        }
    });
    flatpickr(row.find(".date-picker").toArray(), { dateFormat: "Y-m-d" });
});

$(".price-save").on("click", async function () {
    const data = [];
    $(".price-list-nodes .price-button-inputs").each(function () {
        const row = $(this);
        const selects = row.find("select");
        const inputs = row.find("input");
        const toNullIfNotPositive = val => {
            const num = Number(val);
            return Number.isFinite(num) && num > 0 ? num : null;
        };
        const obj = {
            id: row.data("id"),
            fromStopId: selects.eq(0).val(),
            toStopId: selects.eq(1).val(),
            price1: toNullIfNotPositive(inputs.eq(0).val()),
            price2: toNullIfNotPositive(inputs.eq(1).val()),
            price3: toNullIfNotPositive(inputs.eq(2).val()),
            webPrice: toNullIfNotPositive(inputs.eq(3).val()),
            singleSeatPrice1: toNullIfNotPositive(inputs.eq(4).val()),
            singleSeatPrice2: toNullIfNotPositive(inputs.eq(5).val()),
            singleSeatPrice3: toNullIfNotPositive(inputs.eq(6).val()),
            singleSeatWebPrice: toNullIfNotPositive(inputs.eq(7).val()),
            seatLimit: inputs.eq(8).val(),
            hourLimit: inputs.eq(9).val() ? Number(inputs.eq(9).val()) : null,
            validFrom: inputs.eq(10).val() ? `${inputs.eq(10).val()}T00:00` : null,
            validUntil: inputs.eq(11).val() ? `${inputs.eq(11).val()}T00:00` : null
        };
        data.push(obj);
    });

    if (!data.length) return;

    await $.ajax({
        url: "/post-save-prices",
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify({ prices: data }),
        success: function () {
            $(".price-nav").click();
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
});


$(".add-price").on("click", () => {
    resetPriceAddRow();
    $(".price-add-popup").css("display", "block");
});

$(".price-add-close").on("click", () => {
    $(".price-add-popup").css("display", "none");
});

const savePriceAdd = async closeAfterSave => {
    const popup = $(".price-add-popup");
    const row = popup.find(".price-add-row");
    if (!row.hasClass("price-button-inputs")) row.click();
    const selects = row.find("select");
    const inputs = row.find("input");
    const toNullIfNotPositive = val => {
        const num = Number(val);
        return Number.isFinite(num) && num > 0 ? num : null;
    };
    const data = {
        fromStopId: selects.eq(0).val(),
        toStopId: selects.eq(1).val(),
        price1: toNullIfNotPositive(inputs.eq(0).val()),
        price2: toNullIfNotPositive(inputs.eq(1).val()),
        price3: toNullIfNotPositive(inputs.eq(2).val()),
        webPrice: toNullIfNotPositive(inputs.eq(3).val()),
        singleSeatPrice1: toNullIfNotPositive(inputs.eq(4).val()),
        singleSeatPrice2: toNullIfNotPositive(inputs.eq(5).val()),
        singleSeatPrice3: toNullIfNotPositive(inputs.eq(6).val()),
        singleSeatWebPrice: toNullIfNotPositive(inputs.eq(7).val()),
        seatLimit: inputs.eq(8).val(),
        hourLimit: inputs.eq(9).val(),
        validFrom: inputs.eq(10).val(),
        validUntil: inputs.eq(11).val()
    };

    await $.ajax({
        url: "/post-add-price",
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify(data),
        success: function () {
            $(".price-nav").click();
            if (closeAfterSave) {
                popup.css("display", "none");
            }
            resetPriceAddRow();
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
};

$(".price-add-save").on("click", () => savePriceAdd(true));
$(".price-add-save-continue").on("click", () => savePriceAdd(false));


$(".trip-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".trip").css("display", "none")
})

$(".add-trip").on("click", async e => {
    editingTripId = null
    $(".trip").css("width", "90vw")
    $(".trip-list").removeClass("col-12").addClass("col-7")
    $(".trip-info").css("display", "flex")

    try {
        const [routes, busModels, buses] = await Promise.all([
            $.get("/get-routes-data"),
            $.get("/get-bus-models-data"),
            $.get("/get-buses-data")
        ])

        const routeSelect = $(".trip-route")
        routeSelect.empty().append('<option value="" selected></option>')
        routes.forEach(r => routeSelect.append(`<option value="${r.id}">${r.title}</option>`))

        const modelSelect = $(".trip-bus-model")
        modelSelect.empty().append('<option value="" selected></option>')
        busModels.forEach(bm => modelSelect.append(`<option value="${bm.id}">${bm.title}</option>`))

        const busSelect = $(".trip-bus")
        busSelect.empty().append('<option value="" selected></option>')
        buses.forEach(b => busSelect.append(`<option value="${b.id}">${b.licensePlate}</option>`))
    } catch (err) {
        console.log(err)
    }
})

$(".save-trip").on("click", async e => {
    const routeId = $(".trip-route").val()
    const firstDate = $(".trip-first-date").val()
    const lastDate = $(".trip-last-date").val()
    const departureTime = $(".trip-departure").val()
    const busModelId = $(".trip-bus-model").val()
    const busId = $(".trip-bus").val()

    await $.ajax({
        url: "/post-save-trip",
        type: "POST",
        data: {
            routeId, firstDate, lastDate, departureTime, busModelId, busId
        },
        success: function (response) {
            $(".trip-route").val("")
            $(".trip-first-date").val("")
            $(".trip-last-date").val("")
            $(".trip-departure").val("")
            $(".trip-bus-model").val("")
            $(".trip-bus").val("")
            $(".blackout").css("display", "none")
            $(".trip").css("display", "none")
            $(".trip-info").css("display", "none")
            $(".trip-settings").css("display", "none")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".ticket-cancel-refund-open-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".ticket-cancel-refund-open").css("display", "none")
})

let editingBranchId = null

async function loadBranchOptions() {
    const stops = await $.ajax({
        url: "/get-stops-list",
        type: "GET",
        data: { onlyData: true }
    });

    const stopOptions = ["<option value=\"\" selected></option>"];
    for (const s of stops) {
        stopOptions.push(`<option value="${s.id}">${s.title}</option>`);
    }
    $(".branch-place").html(stopOptions);

    const branches = await $.ajax({
        url: "/get-branches-list",
        type: "GET",
        data: { onlyData: true }
    });

    const branchOptions = ["<option value=\"\" selected></option>"];
    for (const b of branches) {
        if (b.isMainBranch) {
            branchOptions.push(`<option value="${b.id}">${b.title}</option>`);
        }
    }
    $(".branch-main-branch").html(branchOptions);
}
$(".branch-settings-nav").on("click", async e => {
    await $.ajax({
        url: "/get-branches-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".branch-list-nodes").html(response)

            $(".branch-button").on("click", async e => {
                await loadBranchOptions();
                const id = e.currentTarget.dataset.id
                const title = e.currentTarget.dataset.title
                editingBranchId = id
                await $.ajax({
                    url: "/get-branch",
                    type: "GET",
                    data: { id: id, title: title },
                    success: function (response) {
                        $("#isBranchActive").prop("checked", response.isActive)
                        $("#isMainBranch").prop("checked", response.isMainBranch)
                        $(".branch").css("width", "60vw")
                        $(".branch-list").removeClass("col-12").addClass("col-4")
                        $(".save-branch").html("KAYDET")
                        $(".branch-info").css("display", "flex")
                        $(".branch-settings").css("display", "block")
                        $(".branch-title").val(response.title)
                        $(".branch-place").val(response.stopId)
                        $(".branch-main-branch").val(response.mainBranchId)
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                })
            })

            $(".blackout").css("display", "block")
            $(".branch").css("display", "block")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

if ($("#isMainBranch").is(":checked")) {
    $(".is-main-branch-group").hide();
} else {
    $(".is-main-branch-group").show();
}

// Checkbox değiştiğinde kontrol et
$("#isMainBranch").on("change", function () {
    if ($(this).is(":checked")) {
        $(".is-main-branch-group").hide();
    } else {
        $(".is-main-branch-group").show();
    }
});

$(".branch-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".branch").css("display", "none")
})

$(".add-branch").on("click", async e => {
    await loadBranchOptions();
    $("#isBranchActive").prop('checked', true)
    $("#isMainBranch").prop('checked', false)
    $(".branch-title").val("")
    $(".branch-place").val("")
    $(".branch-main-branch").val("")
    editingBranchId = null
    $(".branch").css("width", "60vw")
    $(".branch-list").removeClass("col-12").addClass("col-4")
    $(".branch-info").css("display", "flex")
    $(".branch-settings").css("display", "block")
    $(".save-branch").html("EKLE")
})

$(".save-branch").on("click", async e => {
    const isActive = $("#isBranchActive").prop('checked')
    const isMainBranch = $("#isMainBranch").prop('checked')
    const title = $(".branch-title").val()
    const stop = $(".branch-place").val()
    const mainBranch = $(".branch-main-branch").val()

    await $.ajax({
        url: "/post-save-branch",
        type: "POST",
        data: { id: editingBranchId, isActive, isMainBranch, title, stop, mainBranch },
        success: function (response) {
            editingBranchId = null
            $("#isBranchActive").prop('checked', false)
            $("#isMainBranch").prop('checked', false)
            $(".branch-title").val("")
            $(".branch-place").val("")
            $(".branch-main-branch").val("")
            $(".blackout").css("display", "none")
            $(".branch").css("display", "none")
            $(".branch-info").css("display", "none")
            $(".branch-settings").css("display", "none")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

let editingUserId = null

function renderPermissions(perms) {
    const modules = ['register', 'trip', 'sales', 'account_cut'];
    modules.forEach(m => {
        const container = $(`.permission-list[data-module="${m}"]`);
        container.html('');
        if (perms[m]) {
            perms[m].forEach(p => {
                const id = `perm-${p.id}`;
                container.append(`<div class="form-check"><input class="form-check-input permission-checkbox" type="checkbox" value="${p.id}" id="${id}" ${p.allow ? 'checked' : ''}><label class="form-check-label" for="${id}">${p.description}</label></div>`);
            });
        }
    });
}

$(".user-settings-nav").on("click", async e => {
    const branchSelect = $(".user-branches")
    branchSelect.empty()
    await $.ajax({
        url: "/get-branches-list",
        type: "GET",
        data: { onlyData: true, isJustActives: false },
        success: function (branches) {
            branchSelect.append(`<option value="" selected></option>`)
            branches.forEach(b => {
                branchSelect.append(`<option value="${b.id}">${b.title}</option>`)
            })
        },
        error: function (xhr, status, error) {
            console.log(error)
        }
    })

    await $.ajax({
        url: "/get-users-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".user-list-nodes").html(response)

            $(".user-button").on("click", async e => {
                const id = e.currentTarget.dataset.id
                const username = e.currentTarget.dataset.username
                editingUserId = id
                await $.ajax({
                    url: "/get-user",
                    type: "GET",
                    data: { id: id, username: username },
                    success: function (response) {
                        $("#isUserActive").prop("checked", response.isActive)
                        $(".users").css("width", "90vw")
                        $(".user-list").removeClass("col-12").addClass("col-4")
                        $(".save-user").html("KAYDET")
                        $(".user-info").css("display", "flex")
                        $(".user-settings").css("display", "block")
                        $(".user-name").val(response.name)
                        $(".user-username").val(response.username)
                        $(".user-password").val("")
                        $(".user-phone").val(response.phoneNumber)
                        $(".user-branches").val(response.branchId)
                        console.log(response.permissions)
                        renderPermissions(response.permissions)
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                })
            })

            $(".blackout").css("display", "block")
            $(".users").css("display", "block")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".users-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".users").css("display", "none")
})

$(".customer-nav").on("click", async e => {
    await $.ajax({
        url: "/get-customers-list",
        type: "GET",
        data: { blacklist: false },
        success: function (response) {
            $(".customer-list-nodes").html(response)
            $(".blacklist-reason-header").hide()
            $(".blackout").css("display", "block")
            $(".customers").css("display", "block")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".announcement-add-nav").on("click", async e => {
    const branchSelect = $(".announcement-branch")
    branchSelect.empty()
    branchSelect.append(`<option value="" selected>Herkes</option>`)
    try {
        const branches = await $.ajax({ url: "/get-branches-list", type: "GET", data: { onlyData: true, isJustActives: false } })
        branches.forEach(b => branchSelect.append(`<option value="${b.id}">${b.title}</option>`))
    } catch (err) {
        console.log(err)
    }
    $(".announcement-message").val("")
    $(".announcement-show-ticker").prop("checked", false)
    $(".announcement-show-popup").prop("checked", true)
    $(".blackout").css("display", "block")
    $(".add-announcement").css("display", "block")
})

$(".announcement-add-close").on("click", e => {
    $(".add-announcement").css("display", "none")
    $(".blackout").css("display", "none")
})

$(".announcement-add-button").on("click", async e => {
    const message = $(".announcement-message").val()
    const branchId = $(".announcement-branch").val()
    const showTicker = $(".announcement-show-ticker").is(":checked")
    const showPopup = $(".announcement-show-popup").is(":checked")
    await $.ajax({
        url: "/post-save-announcement",
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify({ message, branchId, showTicker, showPopup }),
        success: function () {
            $(".announcement-add-close").click()
        },
        error: function (xhr, status, error) {
            console.log(error)
        }
    })
})

$(".customer-search-btn").on("click", async e => {
    const idNumber = $(".customer-search-idNumber").val();
    const name = $(".customer-search-name").val();
    const surname = $(".customer-search-surname").val();
    const phone = $(".customer-search-phone").val();

    await $.ajax({
        url: "/get-customers-list",
        type: "GET",
        data: { idNumber, name, surname, phone, blacklist: false },
        success: function (response) {
            $(".customer-list-nodes").html(response)
            $(".blacklist-reason-header").hide()
            $(".customer-list-name-header").removeClass("col-2").addClass("col-3")
            $(".customer-list-category-header").removeClass("col-2").addClass("col-3")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".customer-blacklist-btn").on("click", async e => {
    const idNumber = $(".customer-search-idNumber").val();
    const name = $(".customer-search-name").val();
    const surname = $(".customer-search-surname").val();
    const phone = $(".customer-search-phone").val();

    await $.ajax({
        url: "/get-customers-list",
        type: "GET",
        data: { idNumber, name, surname, phone, blacklist: true },
        success: function (response) {
            $(".customer-list-nodes").html(response)
            $(".customer-blacklist-remove").on("click", async e => {
                const id = e.currentTarget.dataset.id
                await $.ajax({
                    url: "/post-customer-blacklist",
                    type: "POST",
                    data: { id, isRemove: true },
                    success: function () {
                        $(".customer-blacklist-pop-up").css("display", "none");
                        $(".customer-blacklist-btn").click();
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                });
            })
            $(".blacklist-reason-header").show()
            $(".customer-list-name-header").removeClass("col-3").addClass("col-2")
            $(".customer-list-category-header").removeClass("col-3").addClass("col-2")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(document).off("click", ".customer-blacklist-open").on("click", ".customer-blacklist-open", function (e) {
    const id = $(this).data("id");
    $(".customer-blacklist-pop-up").data("id", id);
    $(".customer-blacklist-description").val("");
    $(".blackout").css("display", "block");
    $(".customer-blacklist-pop-up").css("display", "block");
});

$(".customer-blacklist-close").on("click", e => {
    $(".blackout").css("display", "none");
    $(".customer-blacklist-pop-up").css("display", "none");
});

$(".customer-blacklist-add").on("click", async e => {
    const id = $(".customer-blacklist-pop-up").data("id");
    const description = $(".customer-blacklist-description").val();
    await $.ajax({
        url: "/post-customer-blacklist",
        type: "POST",
        data: { id, description },
        success: function () {
            $(".customer-blacklist-pop-up").css("display", "none");
            $(".customer-search-btn").click();
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
});

$(".customers-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".customers").css("display", "none")
})

$(".member-nav").on("click", async e => {
    await $.ajax({
        url: "/get-members-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".member-list-nodes").html(response)
            $(".blackout").css("display", "block")
            $(".members").css("display", "block")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".reports-nav").on("click", e => {
    $(".blackout").css("display", "block");
    $(".reports-popup").css("display", "flex");
});

$(".reports-close").on("click", e => {
    $(".blackout").css("display", "none");
    $(".reports-popup").css("display", "none");
});

var report = null;
$(".report-item").on("click", async e => {
    report = $(e.currentTarget).data("report");
    $(".reports-popup").css("display", "none");
    const popup = $(`.${report}-report-popup`).css("display", "flex");

    if ((report === "salesAndRefunds" || report === "webTickets") && !popup.data("initialized")) {
        const [branches, stops] = await Promise.all([
            fetch("/get-branches-list?onlyData=true").then(r => r.json()),
            fetch("/get-stops-list?onlyData=true").then(r => r.json())
        ]);

        const branchSel = popup.find(".report-branch").empty().append('<option value="">Seçiniz</option>');
        branches.forEach(b => branchSel.append(`<option value="${b.id}">${b.title}</option>`));

        const fromSel = popup.find(".report-from").empty().append('<option value="">Seçiniz</option>');
        const toSel = popup.find(".report-to").empty().append('<option value="">Seçiniz</option>');
        stops.forEach(s => {
            fromSel.append(`<option value="${s.id}">${s.title}</option>`);
            toSel.append(`<option value="${s.id}">${s.title}</option>`);
        });

        branchSel.off("change").on("change", async function () {
            const id = $(this).val();
            const userSel = popup.find(".report-user").empty().append('<option value="">Seçiniz</option>');
            if (id) {
                const users = await fetch(`/get-users-by-branch?id=${id}`).then(r => r.json());
                users.forEach(u => userSel.append(`<option value="${u.id}">${u.name}</option>`));
            }
        });

        flatpickr(popup.find(".report-start")[0], { enableTime: true, dateFormat: "Y-m-d H:i", time_24hr: true });
        flatpickr(popup.find(".report-end")[0], { enableTime: true, dateFormat: "Y-m-d H:i", time_24hr: true });

        popup.data("initialized", true);
    }

    if (report === "dailyUserAccount" && !popup.data("initialized")) {
        try {
            const users = await fetch("/get-users-list?onlyData=true").then(r => r.json());
            const userSel = popup.find(".report-user").empty().append('<option value="">Seçiniz</option>');
            users.forEach(u => {
                userSel.append(`<option value="${u.id}">${u.name}</option>`);
            });
        } catch (err) {
            console.error("dailyUserAccount users load error", err);
        }

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

        const startInput = popup.find(".report-start")[0];
        if (startInput) {
            flatpickr(startInput, {
                enableTime: true,
                time_24hr: true,
                dateFormat: "Y-m-d H:i",
                defaultDate: startOfDay,
            });
        }

        const endInput = popup.find(".report-end")[0];
        if (endInput) {
            flatpickr(endInput, {
                enableTime: true,
                time_24hr: true,
                dateFormat: "Y-m-d H:i",
                defaultDate: now,
            });
        }

        popup.data("initialized", true);
    }

    if (report === "dailyUserAccount" && !popup.data("initialized")) {
        try {
            const users = await fetch("/get-users-list?onlyData=true").then(r => r.json());
            const userSel = popup.find(".report-user").empty().append('<option value="">Seçiniz</option>');
            users.forEach(u => {
                userSel.append(`<option value="${u.id}">${u.name}</option>`);
            });
        } catch (err) {
            console.error("dailyUserAccount users load error", err);
        }

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

        const startInput = popup.find(".report-start")[0];
        if (startInput) {
            flatpickr(startInput, {
                enableTime: true,
                time_24hr: true,
                dateFormat: "Y-m-d H:i",
                defaultDate: startOfDay,
            });
        }

        const endInput = popup.find(".report-end")[0];
        if (endInput) {
            flatpickr(endInput, {
                enableTime: true,
                time_24hr: true,
                dateFormat: "Y-m-d H:i",
                defaultDate: now,
            });
        }

        popup.data("initialized", true);
    }
});

$(".report-close").on("click", e => {
    $(e.currentTarget).closest(".report-popup").css("display", "none");
    $(".reports-popup").css("display", "flex");
});

$(".report-create-button").on("click", e => {
    const popup = $(e.currentTarget).closest(".report-popup");
    const startDate = popup.find(".report-start").val();
    const endDate = popup.find(".report-end").val();
    const type = popup.find(".report-type").val();
    const branchId = popup.find(".report-branch").val();
    const userId = popup.find(".report-user").val();
    const fromStopId = popup.find(".report-from").val();
    const toStopId = popup.find(".report-to").val();
    const groupSelect = popup.find(".report-group");
    const groupBy = groupSelect.length && !groupSelect.prop("disabled") ? groupSelect.val() : null;

    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (type) params.set("type", type);
    if (branchId) params.set("branchId", branchId);
    if (userId) params.set("userId", userId);
    if (fromStopId) params.set("fromStopId", fromStopId);
    if (toStopId) params.set("toStopId", toStopId);
    if (groupBy) params.set("groupBy", groupBy);

    window.open(`/${report}?${params.toString()}`, "_blank");
});

$(".members-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".members").css("display", "none")
})

$(document).off("click", ".member-row").on("click", ".member-row", function () {
    const idNumber = $(this).data("idnumber");
    const name = $(this).data("name");
    const surname = $(this).data("surname");
    const phone = $(this).data("phone");
    const gender = $(this).data("gender");
    const type = $(this).data("customertype");
    const category = $(this).data("customercategory");
    const pointOrPercent = $(this).data("pointorpercent");
    const pointAmount = $(this).data("pointamount");
    const percent = $(this).data("percent");

    $(".member-info-idNumber").val(idNumber);
    $(".member-info-name").val(name);
    $(".member-info-surname").val(surname);
    $(".member-info-phone").val(phone);
    $(".member-info-gender").val(gender);
    $(".member-info-type").val(type);
    $(".member-info-category").val(category);
    $(".member-info-pointorpercent").val(pointOrPercent);
    $(".member-info-pointamount").val(pointAmount);
    $(".member-info-percent").val(percent);

    $(".members").css("display", "none");
    $(".member-info").css("display", "block");
    $(".blackout").css("display", "block");

    $.ajax({
        url: "/get-member-tickets",
        type: "GET",
        data: { idNumber },
        success: function (resp) {
            $(".member-ticket-list").html(resp);
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
});

$(".member-info-close").on("click", e => {
    $(".member-info").css("display", "none");
    $(".members").css("display", "block");
});

function searchMembers() {
    const idNumber = $(".member-search-idNumber").val()
    const name = $(".member-search-name").val()
    const surname = $(".member-search-surname").val()
    const phone = $(".member-search-phone").val()

    $.ajax({
        url: "/get-members-list",
        type: "GET",
        data: { idNumber, name, surname, phone },
        success: function (resp) {
            $(".member-list-nodes").html(resp)
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
}

$(".member-search-btn").on("click", searchMembers)

$(".member-add-btn").on("click", async e => {
    const idNumber = $(".member-search-idNumber").val()
    const name = $(".member-search-name").val()
    const surname = $(".member-search-surname").val()
    const phone = $(".member-search-phone").val()

    if (idNumber && name && surname && phone) {
        await $.ajax({
            url: "/post-add-member",
            type: "POST",
            data: {
                idNumber: idNumber,
                name: name,
                surname: surname,
                phone: phone
            },
            success: async function (response) {
                searchMembers()
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        })
    }
})

$(".add-user").on("click", async e => {
    $("#isUserActive").prop("checked", true)
    $(".user-name").val("")
    $(".user-username").val("")
    $(".user-password").val("")
    $(".user-phone").val("")
    $(".user-branches").val("")
    editingUserId = null
    $(".users").css("width", "90vw")
    $(".user-list").removeClass("col-12").addClass("col-4")
    $(".user-info").css("display", "flex")
    $(".user-settings").css("display", "block")
    $(".save-user").html("EKLE")
    await $.ajax({
        url: "/get-user",
        type: "GET",
        data: {},
        success: function (response) {
            renderPermissions(response.permissions)
        },
        error: function (xhr, status, error) {
            console.log(error)
        }
    })
})

$(".save-user").on("click", async e => {
    const isActive = $("#isUserActive").prop("checked")
    const name = $(".user-name").val()
    const username = $(".user-username").val()
    const password = $(".user-password").val()
    const phone = $(".user-phone").val()
    const branchId = $(".user-branches").val()
    const permissions = $(".permission-checkbox:checked").map((_, el) => $(el).val()).get()

    await $.ajax({
        url: "/post-save-user",
        type: "POST",
        data: { id: editingUserId, isActive, name, username, password, phone, branchId, permissions: JSON.stringify(permissions) },
        success: function (response) {
            $("#isUserActive").prop("checked", true)
            $(".user-name").val("")
            $(".user-username").val("")
            $(".user-password").val("")
            $(".user-phone").val("")
            $(".user-branches").val("")
            editingUserId = null
            $(".blackout").css("display", "none")
            $(".users").css("display", "none")
            $(".user-info").css("display", "none")
            $(".user-settings").css("display", "none")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".register-reset-nav").on("click", async e => {
    if (!confirm("Kasayı sıfırlamak istediğinize emin misiniz?")) return
    await $.ajax({
        url: "/post-reset-register",
        type: "POST",
        data: {},
        success: function (response) {
            $(".register").css("display", "none")
            $(".blackout").css("display", "none")
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".transaction-transfer-nav").on("click", async e => {
    await $.ajax({
        url: "/get-branches-list",
        type: "GET",
        data: { onlyData: true },
        success: function (response) {
            let arr = []
            const option = $("<option>").val("").prop("selected", true)
            arr.push(option)
            for (let i = 0; i < response.length; i++) {
                const branch = response[i];
                const option = $("<option>").addClass("transaction-transfer-branch-option").html(branch.title).val(branch.id)
                arr.push(option)
                $(".transaction-transfer").css("display", "block")
                $(".register").css("z-index", 9)
            }
            $(".transfer-branch").html(arr)
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".transfer-branch").on("change", async e => {
    await $.ajax({
        url: "/get-users-by-branch",
        type: "GET",
        data: { onlyData: true, id: e.currentTarget.value },
        success: function (response) {
            let arr = []
            const option = $("<option>").val("").prop("selected", true)
            arr.push(option)
            for (let i = 0; i < response.length; i++) {
                const user = response[i];
                const option = $("<option>").addClass("transaction-transfer-user-option").html(user.name).val(user.id).attr("data-username", user.username)
                arr.push(option)
            }
            $(".transfer-user").html(arr)
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".transaction-transfer-button").on("click", async e => {
    const branch = $(".transfer-branch").val()
    const user = $(".transfer-user").val()

    await $.ajax({
        url: "/post-transfer-register",
        type: "POST",
        data: { branch, user },
        success: function (response) {
            $(".transaction-transfer").css("display", "none")
            $(".register").css("display", "none")
            $(".blackout").css("display", "none")
            $(".register").css("z-index", 100)
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(".transaction-transfer-close").on("click", e => {
    $(".transaction-transfer").css("display", "none")
    $(".register").css("z-index", 100)
})

$(".payment-request-nav").on("click", async e => {
    const users = await $.ajax({
        url: "/get-users-list",
        type: "GET",
        data: { onlyData: true }
    });
    let arr = [];
    const option = $("<option>").val("").prop("selected", true);
    arr.push(option);
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const option = $("<option>").html(user.name).val(user.id);
        arr.push(option);
    }
    $(".payment-request-user").html(arr);
    $(".blackout").css("display", "block");
    $(".payment-request").css("display", "block");
});

$(".payment-request-close").on("click", e => {
    $(".payment-request").css("display", "none");
    $(".blackout").css("display", "none");
});

$(".payment-request-button").on("click", async e => {
    const userId = $(".payment-request-user").val();
    const amount = $(".payment-request-amount").val();
    await $.ajax({
        url: "/post-request-payment",
        type: "POST",
        data: { userId, amount },
        success: function () {
            $(".payment-request-close").click();
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
});

$(".payment-send-nav").on("click", async e => {
    const users = await $.ajax({
        url: "/get-users-list",
        type: "GET",
        data: { onlyData: true }
    });
    let arr = [];
    const option = $("<option>").val("").prop("selected", true);
    arr.push(option);
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const option = $("<option>").html(user.name).val(user.id);
        arr.push(option);
    }
    $(".payment-send-user").html(arr);
    $(".blackout").css("display", "block");
    $(".payment-send").css("display", "block");
});

$(".payment-send-close").on("click", e => {
    $(".payment-send").css("display", "none");
    $(".blackout").css("display", "none");
});

$(".payment-send-button").on("click", async e => {
    const userId = $(".payment-send-user").val();
    const amount = $(".payment-send-amount").val();
    await $.ajax({
        url: "/post-send-payment",
        type: "POST",
        data: { userId, amount },
        success: function () {
            $(".payment-send-close").click();
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
});

async function loadPendingPayments() {
    await $.ajax({
        url: "/get-pending-payments",
        type: "GET",
        success: function (response) {
            $(".pending-payments-list").html(response)
            $(".blackout").css("display", "block");
            $(".pending-payments").css("display", "block");
            $(".payment-button").on("click", e => {
                $.ajax({ url: "/post-confirm-payment", type: "POST", data: { id: $(e.currentTarget).attr("data-id"), action: $(e.currentTarget).attr("data-action") } });
                $(e.currentTarget).closest(".payment").remove()
            })
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
}

async function loadPendingCollections(global = true) {
    await $.ajax({
        url: "/get-pending-collections",
        type: "GET",
        global: global,
        success: function (response) {
            $(".pending-collections-list").html(response)
            $(".blackout").css("display", "block");
            $(".pending-collections").css("display", "block");
            $(".payment-button").on("click", e => {
                $.ajax({ url: "/post-confirm-payment", type: "POST", data: { id: $(e.currentTarget).attr("data-id"), action: $(e.currentTarget).attr("data-action") } });
                $(e.currentTarget).closest(".payment").remove()
            })
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
}

$(".pending-payments-nav").on("click", loadPendingPayments);

setInterval(async () => {
    if ($(".pending-collections").css("display") === "none") {
        await loadPendingCollections(global = false);
    }
}, 60000);

$(".pending-payments-close").on("click", e => {
    $(".pending-payments").css("display", "none");
    $(".blackout").css("display", "none");
});

$(".pending-collections-nav").on("click", loadPendingCollections)

$(".pending-collections-close").on("click", e => {
    $(".pending-collections").css("display", "none");
    $(".blackout").css("display", "none");
});

const popupQueue = [];
const shownPopupIds = new Set();
let showingPopup = false;

function showNextPopup() {
    if (!popupQueue.length) {
        showingPopup = false;
        $(".blackout").hide();
        return;
    }
    showingPopup = true;
    const a = popupQueue.shift();
    const pop = $("<div>").addClass("announcement-pop-up");
    const header = $("<div>").addClass("gtr-header").append($("<span>").text("DUYURU"));
    const close = $("<div>").addClass("announcement-pop-up-close").append($("<i>").addClass("fa-solid fa-x"));
    close.on("click", async () => {
        await $.ajax({ url: "/post-announcement-seen", type: "POST", data: { announcementId: a.id } });
        pop.remove();
        showNextPopup();
    });
    const body = $("<div>").addClass("p-3");
    body.append($("<p>").text(a.message));
    if (a.senderName) {
        body.append($("<p>").addClass("mt-2 mb-0 text-end text-muted").text(a.senderName));
    }
    pop.append(header, close, body);
    $("body").append(pop);
    $(".blackout").show();
    pop.show();
}

async function loadAnnouncements() {
    try {
        const data = await $.ajax({
            url: "/get-announcements",
            type: "GET"
        });

        if (data.ticker && data.ticker.length) {
            const text = data.ticker.map(a => a.message).join(" • ");
            $(".ticker p").text(text);
        }

        const popups = data.popup || [];
        popups.forEach(a => {
            if (!shownPopupIds.has(a.id)) {
                popupQueue.push(a);
                shownPopupIds.add(a.id);
            }
        });
        if (!showingPopup) showNextPopup();
    } catch (err) {
        console.error("Announcement error:", err);
    }
}

$(loadAnnouncements);