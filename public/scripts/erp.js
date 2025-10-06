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

function parsePriceAttribute(value) {
    if (value === undefined || value === null || value === "") {
        return [];
    }

    if (Array.isArray(value)) {
        return value
            .map(v => Number(v))
            .filter(v => !Number.isNaN(v));
    }

    if (typeof value === "number") {
        return Number.isNaN(value) ? [] : [value];
    }

    if (typeof value === "string") {
        const trimmed = value.trim();

        if (!trimmed) {
            return [];
        }

        try {
            const parsed = JSON.parse(trimmed);

            if (Array.isArray(parsed)) {
                return parsed
                    .map(v => Number(v))
                    .filter(v => !Number.isNaN(v));
            }

            if (typeof parsed === "number" && !Number.isNaN(parsed)) {
                return [parsed];
            }

            return [];
        } catch (err) {
            return trimmed
                .split(",")
                .map(part => Number(part.trim()))
                .filter(v => !Number.isNaN(v));
        }
    }

    return [];
}

function getPriceLists($priceContainer) {
    const seatType = $priceContainer.attr("data-seat-type") === "single" ? "single" : "standard";
    const regularPrices = parsePriceAttribute($priceContainer.attr("data-regular-prices"));
    const singlePrices = parsePriceAttribute($priceContainer.attr("data-single-prices"));

    const activeList = seatType === "single"
        ? (singlePrices.length ? singlePrices : regularPrices)
        : (regularPrices.length ? regularPrices : singlePrices);

    return {
        seatType,
        regularPrices,
        singlePrices,
        activeList,
    };
}

function updateTicketRowsSumPrice() {
    const $sumInput = $(".ticket-rows .sum-price input");
    if (!$sumInput.length) {
        return;
    }

    let total = 0;
    let hasAnyValue = false;

    $(".ticket-row .price input").each((_, input) => {
        const rawValue = ($(input).val() || "").toString().trim();
        if (!rawValue) {
            return;
        }

        const normalizedValue = Number(rawValue.replace(",", "."));
        if (!Number.isNaN(normalizedValue)) {
            total += normalizedValue;
            hasAnyValue = true;
        }
    });

    if (!hasAnyValue) {
        $sumInput.val("");
        return;
    }

    const roundedTotal = Math.round(total * 100) / 100;
    const formattedTotal = Number.isInteger(roundedTotal)
        ? roundedTotal
        : roundedTotal.toFixed(2);

    $sumInput.val(formattedTotal);
}

function initializeTicketRowPriceControls() {
    originalPrices = [];

    $(".ticket-row").each((index, row) => {
        const $row = $(row);
        const $priceInput = $row.find(".price input").first();
        const basePrice = Number($priceInput.val());

        originalPrices[index] = Number.isNaN(basePrice) ? null : basePrice;
    });

    const $priceInputs = $(".ticket-row .price input");
    $priceInputs.off(".sumPrice").on("input.sumPrice change.sumPrice", () => {
        updateTicketRowsSumPrice();
    });

    updateTicketRowsSumPrice();

    if (window.GTR && window.GTR.searchableSelect && typeof window.GTR.searchableSelect.init === "function") {
        const takeSelects = document.querySelectorAll(".ticket-info select[data-searchable-select]");
        if (takeSelects && takeSelects.length) {
            window.GTR.searchableSelect.init(takeSelects);
        }
    }
}

function getFocusableTicketRowInputs($row) {
    return $row
        .find("input")
        .filter(function () {
            const $input = $(this);
            const type = ($input.attr("type") || "").toLowerCase();

            if (type === "hidden") {
                return false;
            }

            if ($input.is(":disabled")) {
                return false;
            }

            if (!$input.is(":visible")) {
                return false;
            }

            return true;
        });
}

function focusNextTicketRowInput(currentInput) {
    const $current = $(currentInput);
    const $row = $current.closest(".ticket-row");

    if (!$row.length) {
        return;
    }

    const $inputs = getFocusableTicketRowInputs($row);
    const currentIndex = $inputs.index($current);

    if (currentIndex === -1) {
        return;
    }

    const $nextInput = $inputs.eq(currentIndex + 1);

    if ($nextInput.length) {
        $nextInput.trigger("focus");
        if (typeof $nextInput[0].select === "function") {
            $nextInput[0].select();
        }
        return;
    }

    const $nextRow = $row.next(".ticket-row");

    if (!$nextRow.length) {
        return;
    }

    const $firstInput = getFocusableTicketRowInputs($nextRow).first();

    if ($firstInput.length) {
        $firstInput.trigger("focus");
        if (typeof $firstInput[0].select === "function") {
            $firstInput[0].select();
        }
    }
}

$(document).off("keydown.ticketRowEnter").on("keydown.ticketRowEnter", ".ticket-row input", function (event) {
    if (event.key !== "Enter") {
        return;
    }

    const type = ($(event.currentTarget).attr("type") || "").toLowerCase();

    if (type === "radio") {
        return;
    }

    event.preventDefault();
    focusNextTicketRowInput(event.currentTarget);
});

let tripStaffInitial = {};
let tripStaffList = [];

let tripStopRestrictionChanges = {};
let tripStopRestrictionDirty = false;

let tripCargoStops = [];
let tripTimeAdjustStops = [];
let tripTimeAdjustPicker;
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

const ESC_CLOSE_BUTTON_SELECTORS = [
    ".announcement-pop-up-close",
    ".user-profile-close",
    ".user-profile-cancel",
    ".change-password-close",
    ".change-password-cancel",
    ".error-close",
    ".account-cut-deductions-cancel",
    ".account-cut-close",
    ".add-transaction-close",
    ".announcement-add-close",
    ".branch-close",
    ".bus-close",
    ".bus-plans-close",
    ".bus-transaction-close",
    ".customer-blacklist-close",
    ".customers-close",
    ".member-info-close",
    ".members-close",
    ".moving-close",
    ".open-ticket-close",
    ".other-register-close",
    ".payment-request-close",
    ".payment-send-close",
    ".pending-collections-close",
    ".pending-payments-close",
    ".price-add-close",
    ".price-close",
    ".register-close",
    ".report-close",
    ".reports-close",
    ".route-close",
    ".staff-close",
    ".stops-close",
    ".ticket-close",
    ".ticket-search-close",
    ".ticket-cancel-refund-open-close",
    ".transaction-transfer-close",
    ".trip-cargo-close",
    ".trip-cargo-list-close",
    ".trip-close",
    ".trip-note-close",
    ".trip-revenue-close",
    ".trip-staff-close",
    ".trip-stop-restriction-close",
    ".trip-time-adjust-close",
    ".trip-time-adjust-cancel",
    ".users-close",
];

const ESC_FALLBACK_POPUPS = [
    {
        selector: ".ticket-info-pop-up",
        close: () => {
            if (typeof ticketClose === "function") {
                ticketClose();
            } else {
                $(".ticket-info-pop-up").hide();
                $(".blackout").hide();
            }
        },
    },
    {
        selector: ".ticket-ops-pop-up",
        close: $popup => $popup.hide(),
    },
    {
        selector: ".taken-ticket-ops-pop-up",
        close: $popup => $popup.hide(),
    },
    {
        selector: ".search-ticket-ops-pop-up",
        close: $popup => $popup.hide(),
    },
    {
        selector: ".passenger-info-popup",
        close: $popup => $popup.hide(),
    },
];

document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.defaultPrevented) {
        return;
    }

    for (const selector of ESC_CLOSE_BUTTON_SELECTORS) {
        const $buttons = $(selector).filter(":visible");
        if ($buttons.length) {
            $buttons.last().trigger("click");
            event.preventDefault();
            return;
        }
    }

    for (const { selector, close } of ESC_FALLBACK_POPUPS) {
        const $popup = $(selector).filter(":visible");
        if ($popup.length) {
            close($popup);
            event.preventDefault();
            return;
        }
    }
});

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

const clearMemberTicketFeedback = $element => {
    if (!$element || !$element.length) {
        return;
    }

    const $footer = $element.closest(".member-ticket-footer");
    if (!$footer.length) {
        return;
    }

    $footer.find(".member-ticket-feedback").remove();
};

const showMemberTicketFeedback = ($element, message) => {
    if (!$element || !$element.length) {
        return;
    }

    const $footer = $element.closest(".member-ticket-footer");
    if (!$footer.length) {
        return;
    }

    let $feedback = $footer.find(".member-ticket-feedback");
    if (!$feedback.length) {
        $feedback = $("<span>", { class: "member-ticket-feedback text-muted", role: "status" });
        $footer.append($feedback);
    }

    $feedback.text(message || "");
};

$(".error-close").off().on("click", () => $(".error-popup").hide());

const getAjaxErrorMessage = err =>
    err?.responseJSON?.message ||
    err?.responseJSON?.error ||
    err?.responseText ||
    err?.statusText ||
    err?.message ||
    "Bilinmeyen hata";

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
const canManageUserPermissions = () => hasPermission("USER_PERMISSION_MANAGE");

function updatePermissionInputsAccess() {
    const canManage = canManageUserPermissions();
    $(".permission-select-all, .permission-checkbox").prop("disabled", !canManage);
}

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

function populateTripTimeAdjustStops(stops) {
    tripTimeAdjustStops = Array.isArray(stops)
        ? [...stops].sort((a, b) => Number(a.order) - Number(b.order))
        : [];

    const $select = $(".trip-time-adjust-stop");
    if (!$select.length) return;

    const placeholder = $("<option>")
        .val("")
        .text("Seçiniz")
        .prop("disabled", true);

    $select.empty().append(placeholder);

    tripTimeAdjustStops.forEach(stop => {
        const value = stop.routeStopId !== undefined ? stop.routeStopId : stop.id;
        $select.append($("<option>").val(String(value)).text(stop.title));
    });

    let hasSelection = false;
    if (tripTimeAdjustStops.length) {
        const currentMatch = tripTimeAdjustStops.find(stop => String(stop.id) === String(currentStop));
        if (currentMatch) {
            const value = currentMatch.routeStopId !== undefined ? currentMatch.routeStopId : currentMatch.id;
            $select.val(String(value));
            hasSelection = true;
        }
    }

    if (!hasSelection) {
        placeholder.prop("selected", true);
    }
}

function resetTripTimeAdjustForm() {
    const $select = $(".trip-time-adjust-stop");
    if ($select.length) {
        $select.val("");
        $select.find("option[value='']").prop("selected", true);
    }

    $("input[name='trip-time-adjust-direction']").prop("checked", false);

    if (tripTimeAdjustPicker) {
        tripTimeAdjustPicker.setDate("00:15", false);
    } else {
        $(".trip-time-adjust-amount").val("");
    }
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

$(".trip-cargo-from").off().on("change", () => {
    updateTripCargoToOptions();
});

$(function () {
    hideLoading();
    $.get('/permissions')
        .done(perms => {
            window.permissions = perms;
            updatePermissionInputsAccess();
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
    let inputs = [];

    if (typeof selector === "string") {
        inputs = Array.from(document.querySelectorAll(selector));
    } else if (typeof Element !== "undefined" && selector instanceof Element) {
        inputs = [selector];
    } else if (selector && typeof selector[Symbol.iterator] === "function") {
        inputs = Array.from(selector).filter(el => typeof Element !== "undefined" && el instanceof Element);
    }

    if (!inputs.length) return;

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

    const isHtmlInput = el => {
        if (!el || typeof el !== "object") return false;
        if (typeof HTMLInputElement !== "undefined") {
            return el instanceof HTMLInputElement;
        }
        return String(el.tagName).toUpperCase() === "INPUT";
    };

    inputs
        .filter(isHtmlInput)
        .forEach(input => {
            if (input.dataset.phoneInputInitialized === "true") {
                return;
            }

            input.dataset.phoneInputInitialized = "true";

            const onInput = () => {
                const d10 = normalizeTR(input.value);
                input.value = formatTR(d10);
            };

            const onBlur = () => {
                const d10 = normalizeTR(input.value);

                if (!d10) {
                    input.value = "";
                    return;
                }

                if (d10.length !== 10) {
                    input.value = "";
                    return;
                }

                if (mobileOnly && !d10.startsWith("5")) {
                    input.value = "";
                    return;
                }

                input.value = formatTR(d10);
            };

            input.addEventListener("input", onInput);
            input.addEventListener("blur", onBlur);

            if (input.value) {
                onInput();
            }
        });
}

initPhoneInput(".bus-phone");
initPhoneInput(".user-phone");
initPhoneInput(".staff-phone");
initPhoneInput(".search-phone");
initPhoneInput(".member-search-phone");
initPhoneInput(".profile-phone-input");

function getNavbarUserData() {
    const toggle = document.querySelector(".navbar-user-toggle");
    if (!toggle) {
        return { name: "", username: "", phone: "" };
    }

    return {
        name: toggle.dataset.userName || "",
        username: toggle.dataset.userUsername || "",
        phone: toggle.dataset.userPhone || "",
    };
}

function setNavbarUserData(data = {}) {
    const toggle = document.querySelector(".navbar-user-toggle");
    if (!toggle) {
        return;
    }

    if (typeof data.name === "string") {
        toggle.dataset.userName = data.name;
    }
    if (typeof data.username === "string") {
        toggle.dataset.userUsername = data.username;
    }
    if (typeof data.phone === "string") {
        toggle.dataset.userPhone = data.phone;
    }
}

function hideInlineError($element) {
    if ($element && $element.length) {
        $element.text("").addClass("d-none");
    }
}

function showInlineError($element, message) {
    if ($element && $element.length) {
        $element.text(message || "Bilinmeyen hata").removeClass("d-none");
        return;
    }
    showError(message);
}

const userProfilePopupEl = document.querySelector(".user-profile-popup");
const changePasswordPopupEl = document.querySelector(".change-password-popup");

function populateProfileForm() {
    const data = getNavbarUserData();
    $("#profileNameInput").val(data.name || "");
    $("#profileUsernameInput").val(data.username || "");
    $("#profilePhoneInput").val(data.phone || "");
}

function hideUserProfilePopup() {
    if (!userProfilePopupEl) {
        return;
    }
    $(userProfilePopupEl).css("display", "none");
    populateProfileForm();
    hideInlineError($("#userProfileError"));
}

function showUserProfilePopup() {
    if (!userProfilePopupEl) {
        return;
    }
    populateProfileForm();
    hideInlineError($("#userProfileError"));
    $(userProfilePopupEl).css("display", "block");
}

function resetChangePasswordForm() {
    const form = document.getElementById("changePasswordForm");
    if (form) {
        form.reset();
    }
}

function hideChangePasswordPopup() {
    if (!changePasswordPopupEl) {
        return;
    }
    $(changePasswordPopupEl).css("display", "none");
    resetChangePasswordForm();
    hideInlineError($("#changePasswordError"));
}

function showChangePasswordPopup() {
    if (!changePasswordPopupEl) {
        return;
    }
    resetChangePasswordForm();
    hideInlineError($("#changePasswordError"));
    $(changePasswordPopupEl).css("display", "block");
}

if (userProfilePopupEl) {
    populateProfileForm();
}

$(".user-menu-profile").on("click", e => {
    e.preventDefault();
    showUserProfilePopup();
});

$(".user-profile-close").on("click", e => {
    e.preventDefault();
    hideUserProfilePopup();
});
$(".user-profile-cancel").on("click", e => {
    e.preventDefault();
    hideUserProfilePopup();
});

$(".user-menu-password").on("click", e => {
    e.preventDefault();
    showChangePasswordPopup();
});

$(".change-password-close").on("click", e => {
    e.preventDefault();
    hideChangePasswordPopup();
});
$(".change-password-cancel").on("click", e => {
    e.preventDefault();
    hideChangePasswordPopup();
});

$("#userProfileForm").on("submit", async e => {
    e.preventDefault();
    const $error = $("#userProfileError");
    hideInlineError($error);

    const name = $("#profileNameInput").val().trim();
    const username = $("#profileUsernameInput").val().trim();
    const phoneNumber = $("#profilePhoneInput").val().trim();

    if (!name) {
        showInlineError($error, "Ad soyad boş bırakılamaz.");
        return;
    }

    if (!username) {
        showInlineError($error, "Kullanıcı adı boş bırakılamaz.");
        return;
    }

    try {
        showLoading();
        const response = await $.ajax({
            url: "/post-update-profile",
            type: "POST",
            data: { name, username, phoneNumber },
        });
        hideLoading();

        const redirectUrl = response && response.redirect ? response.redirect : "/login";
        const updatedData = {
            name,
            username,
            phone: phoneNumber,
        };
        setNavbarUserData(updatedData);
        window.location.href = redirectUrl;
    } catch (err) {
        hideLoading();
        const message =
            err?.responseJSON?.message ||
            err?.responseJSON?.error ||
            err?.responseText ||
            err?.statusText ||
            err?.message ||
            "Bilinmeyen hata";
        showInlineError($error, message);
    }
});

$("#changePasswordForm").on("submit", async e => {
    e.preventDefault();
    const $error = $("#changePasswordError");
    hideInlineError($error);

    const currentPassword = $("#currentPasswordInput").val();
    const newPassword = $("#newPasswordInput").val();
    const confirmPassword = $("#confirmPasswordInput").val();

    if (!currentPassword) {
        showInlineError($error, "Eski şifreyi giriniz.");
        return;
    }

    if (!newPassword) {
        showInlineError($error, "Yeni şifreyi giriniz.");
        return;
    }

    if (newPassword.length < 6) {
        showInlineError($error, "Yeni şifre en az 6 karakter olmalıdır.");
        return;
    }

    if (newPassword !== confirmPassword) {
        showInlineError($error, "Yeni şifreler eşleşmiyor.");
        return;
    }

    try {
        showLoading();
        const response = await $.ajax({
            url: "/post-change-password",
            type: "POST",
            data: { currentPassword, newPassword, confirmPassword },
        });
        hideLoading();

        const redirectUrl = response && response.redirect ? response.redirect : "/login";
        window.location.href = redirectUrl;
    } catch (err) {
        hideLoading();
        const message =
            err?.responseJSON?.message ||
            err?.responseJSON?.error ||
            err?.responseText ||
            err?.statusText ||
            err?.message ||
            "Bilinmeyen hata";
        showInlineError($error, message);
    }
});
initPhoneInput(".customer-search-phone");
initPhoneInput(".trip-cargo-sender-phone");

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
    let els = [];

    if (typeof selector === "string") {
        els = Array.from(document.querySelectorAll(selector));
    } else if (typeof Element !== "undefined" && selector instanceof Element) {
        els = [selector];
    } else if (selector && typeof selector[Symbol.iterator] === "function") {
        els = Array.from(selector).filter(el => typeof Element !== "undefined" && el instanceof Element);
    }

    if (!els.length) return;

    const { clearOnInvalid = false, liveMark = false } = opts;

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

    const isHtmlInput = el => {
        if (!el || typeof el !== "object") return false;
        if (typeof HTMLInputElement !== "undefined") {
            return el instanceof HTMLInputElement;
        }
        return String(el.tagName).toUpperCase() === "INPUT";
    };

    els
        .filter(isHtmlInput)
        .forEach(el => {
            if (el.dataset.tcknInputInitialized === "true") {
                return;
            }

            el.dataset.tcknInputInitialized = "true";

            const onInput = () => {
                const d = sanitizeValue(el.value);
                el.value = d;

                if (liveMark) {
                    if (d.length === 11 && isValidTCKN(d)) {
                        el.style.borderColor = "green";
                    } else {
                        el.style.borderColor = "";
                    }
                }
            };

            const onBlur = () => {
                const d = sanitizeValue(el.value);
                if (!d) {
                    el.value = "";
                    el.style.borderColor = "";
                    return;
                }

                if (isValidTCKN(d)) {
                    el.value = d;
                    if (liveMark) el.style.borderColor = "green";
                    return;
                }

                if (liveMark) {
                    el.style.borderColor = "";
                }

                if (clearOnInvalid) {
                    el.value = "";
                }
            };

            el.addEventListener("input", onInput);
            el.addEventListener("blur", onBlur);

            if (el.value) {
                onInput();
            }
        });
}

initTcknInputs(".identity input");
initTcknInputs(".search-idnum");
initTcknInputs(".staff-id-number");
initTcknInputs(".member-search-idNumber");
initTcknInputs(".customer-search-idNumber");
initTcknInputs(".trip-cargo-sender-identity");


// Seferi yükler
async function loadTrip(date, time, tripId) {
    try {
        console.log(date);
        console.log(time);
        console.log(tripId);

        const commonData = { date, time, tripId, stopId: currentStop };

        // Bağımsız istekleri paralel çalıştır
        const [
            tripResponse,
            passengersResponse,
            ticketOpsResponse,
            tripNotesResponse,
            routeStopsResponse,
        ] = await Promise.all([
            $.ajax({ url: "/get-trip", type: "GET", data: commonData }),
            $.ajax({ url: "/get-passengers-table", type: "GET", data: commonData }),
            $.ajax({ url: "/get-ticketops-popup", type: "GET", data: commonData }),
            $.ajax({ url: "/get-trip-notes", type: "GET", data: { date, time, tripId } }),
            $.ajax({ url: "/get-route-stops-time-list", type: "GET", data: { date, time, tripId } }),
        ]);

        // Trip HTML
        $(".busPlan").html(tripResponse);

        // Boş satırları temizle
        document.querySelectorAll('.seat-row').forEach(row => {
            const seats = row.querySelectorAll('.seat');
            if (Array.from(seats).every(seat => seat.classList.contains('hidden') || seat.classList.contains('none'))) {
                row.remove();
            }
        });

        // Diğer alanlar
        $(".ticket-ops-pop-up").html(ticketOpsResponse);
        $(".trip-notes").html(tripNotesResponse);
        $(".stops-times").html(routeStopsResponse);

        // Yolcu tablosu ve satır tıklama
        $(".passenger-table").html(passengersResponse);
        $(".passenger-table tbody tr").off().on("click", function (e) {
            const $row = $(this);
            if (!$row.closest('#activeTickets').length) return;

            const $popup = $(".taken-ticket-ops-pop-up");

            // Aynı satıra tıklanırsa popup kapat
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

        const resetTicketOpButtons = () => {
            $(".ticket-op-button").each((_, btn) => {
                const $btn = $(btn);
                if ($btn.data("hiddenBySeat")) {
                    $btn.removeData("hiddenBySeat");
                }
                $btn.css("display", "");
            });
        };

        const updateTicketOpButtonsForSelectedSeats = () => {
            let limitOrder = null;

            selectedSeats.forEach(seatNumber => {
                const seatEl = document.querySelector(`.seat[data-seat-number='${seatNumber}']`);
                if (!seatEl) return;

                const { nextRouteStopOrder } = seatEl.dataset || {};
                if (!nextRouteStopOrder) {
                    return;
                }

                const numericOrder = Number(nextRouteStopOrder);
                if (!Number.isFinite(numericOrder)) {
                    return;
                }

                if (limitOrder === null || numericOrder < limitOrder) {
                    limitOrder = numericOrder;
                }
            });

            if (limitOrder === null) {
                return;
            }

            $(".ticket-op-button").each((_, btn) => {
                const { routeOrder } = btn.dataset || {};
                if (!routeOrder) {
                    return;
                }

                const numericRouteOrder = Number(routeOrder);
                if (!Number.isFinite(numericRouteOrder)) {
                    return;
                }

                if (numericRouteOrder > limitOrder) {
                    const $btn = $(btn);
                    $btn.data("hiddenBySeat", true);
                    $btn.css("display", "none");
                }
            });
        };

        // Koltuk tıklama
        $(".seat").off("click").on("click", function (e) {
            const $seat = $(this);
            resetTicketOpButtons();
            const rect = this.getBoundingClientRect();
            const { createdAt, seatNumber, groupId } = e.currentTarget.dataset;
            const isTaken = Boolean(createdAt); // dolu koltuk mu?

            // ---- Taşıma modu ----
            if (isMovingActive) {
                $(".move-to-trip-date").html(`${new Date(currentTripDate).getDate()}/${Number(new Date(currentTripDate).getMonth()) + 1} | ${currentTripPlaceTime.split(":")[0] + "." + currentTripPlaceTime.split(":")[1]}`);
                $(".move-to-trip-place").html(`${currentStopStr}`);
                $(".move-to").css("display", "flex");
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

                // İlgili buton metnini güncelle
                const $btn = $(".moving-ticket-button").eq(selectedSeats.length - 1);
                if ($btn.length) {
                    $btn.html($btn.html() + ` => ${seatNumber}`);
                }

                return; // taşıma modunda popup yok
            }

            // ---- Normal mod (popup + seçim) ----

            if (!isTaken && selectedTakenSeats.length > 0) {
                alert("Dolu koltuk seçiliyken boş koltuk seçemezsiniz.");
                $(".ticket-ops-pop-up").hide();
                return;
            }

            if (isTaken && selectedSeats.length > 0) {
                alert("Boş koltuk seçiliyken dolu koltuk seçemezsiniz.");
                $(".ticket-ops-pop-up").hide();
                return;
            }

            const $popup = isTaken ? $(".taken-ticket-ops-pop-up") : $(".ticket-ops-pop-up");

            $(".ticket-op").css("display", "flex");

            if ($seat.data("only-gender") == "m") $(".ticket-op.f").css("display", "none");
            else if ($seat.data("only-gender") == "f") $(".ticket-op.m").css("display", "none");

            const isSelectedSeat = $popup.is(":visible") && ((!isTaken && selectedSeats.includes(seatNumber)) || (isTaken && selectedTakenSeats.includes(seatNumber)));
            const movePopupToSeat = targetSeat => {
                if (!targetSeat || !targetSeat.length) {
                    return;
                }

                const seatRect = targetSeat[0].getBoundingClientRect();
                let nextLeft = seatRect.right + window.scrollX + 10;
                let nextTop = seatRect.top + window.scrollY + 25;

                $popup.css({ left: `${nextLeft}px`, top: `${nextTop}px`, display: "block" });

                const popupHeight = $popup.outerHeight();
                const viewportBottom = window.scrollY + window.innerHeight;

                if (nextTop + popupHeight > viewportBottom) {
                    nextTop = seatRect.top + window.scrollY - popupHeight - 10;
                    if (nextTop < 0) nextTop = 0;
                    $popup.css("top", `${nextTop}px`);
                }
            };
            let shouldHidePopup = false;

            if (isSelectedSeat) {
                if (isTaken) {
                    shouldHidePopup = true;
                } else {
                    const remainingSeatCount = selectedSeats.filter(s => s !== seatNumber).length;
                    console.log(remainingSeatCount)
                    if (remainingSeatCount === 0) {
                        shouldHidePopup = true;
                    }
                }
            }

            if (shouldHidePopup) {
                $popup.hide();
                currentSeat = null;
            } else if (!isSelectedSeat) {
                currentSeat = $seat;
                movePopupToSeat($seat);
            }

            // Seçim davranışı (normal mod)
            if (!isTaken) {
                const isSeatSelected = selectedSeats.includes(seatNumber);
                const seatIndex = isSeatSelected ? selectedSeats.indexOf(seatNumber) : -1;

                // boş koltuk toggle
                if (!isSeatSelected) {
                    selectedSeats.push(seatNumber);
                    $seat.addClass("selected");
                } else {
                    selectedSeats = selectedSeats.filter(s => s !== seatNumber);
                    $seat.removeClass("selected");

                    if ($popup.is(":visible") && selectedSeats.length > 0) {
                        const focusIndex = seatIndex > 0 ? seatIndex - 1 : 0;
                        const focusSeatNumber = selectedSeats[focusIndex] || selectedSeats[selectedSeats.length - 1];
                        const $focusSeat = $(`.seat[data-seat-number='${focusSeatNumber}']`);

                        if ($focusSeat.length) {
                            currentSeat = $focusSeat;
                            movePopupToSeat($focusSeat);
                        }
                    }
                }

                updateTicketOpButtonsForSelectedSeats();
            } else {
                const activeGroupId = selectedTakenSeats.length > 0
                    ? $(`.seat[data-seat-number="${selectedTakenSeats[0]}"]`).attr("data-group-id")
                    : null;

                if (activeGroupId && activeGroupId !== groupId) {
                    alert("Başka bir bilet grubu zaten seçili. Önce mevcut seçimi kaldırın.");
                    return;
                }

                // dolu koltuk: grupça seç/kaldır
                currentGroupId = $seat.data("group-id");
                selectedTicketStopId = currentStop;
                updateTakenTicketOpsVisibility($seat);

                if (selectedTakenSeats.length > 0) {
                    selectedTakenSeats = [];
                    $(`.seat[data-group-id='${groupId}']`).each((i, el) => {
                        el.classList.remove("selected");
                    });
                } else {
                    const seatNumbers = [];
                    $(`.seat[data-group-id='${groupId}']`).each((i, el) => {
                        seatNumbers.push(el.dataset.seatNumber);
                        el.classList.add("selected");
                    });
                    selectedTakenSeats = seatNumbers;
                }
            }
        });

        // Komşu koltuk cinsiyet bilgisi
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

        // Hidden input'lardan güncel verileri çek
        currentTripDate = $("#tripDate").val();
        currentTripTime = $("#tripTime").val();
        currentTripPlaceTime = $("#tripPlaceTime").val();
        currentTripId = $("#tripId").val();
        selectedSeats = [];
        selectedTakenSeats = [];

        highlightTripRowByData(currentTripDate, currentTripTime, currentTripId);

        fromId = $("#fromId").val();
        toId = $("#toId").val();
        fromStr = $("#fromStr").val();
        toStr = $("#toStr").val();

        $("#tickets").remove();
        $("#tripDate").remove();
        $("#tripTime").remove();
        $("#tripPlaceTime").remove();
        $("#tripId").remove();
        $("#fromId").remove();
        $("#toId").remove();
        $("#fromStr").remove();
        $("#toStr").remove();

        $(".ticket-info-pop-up_from").html(fromStr.toUpperCase());
        $(".ticket-info-pop-up_to").html(toStr.toUpperCase());

        const tripBusId = $(".trip-bus-license-plate").data("current-bus-id");
        const tripBusModelId = $(".trip-bus-plan").data("current-bus-model-id");

        // Bus model ve bus listelerini paralel al
        try {
            const [busModels, buses] = await Promise.all([
                $.get("/get-bus-models-data"),
                $.get("/get-buses-data")
            ]);

            const $planEl = $(".trip-bus-plan");
            const $plateEl = $(".trip-bus-license-plate");

            if ($planEl.is("select")) {
                const planOpts = [$("<option>").val("").html("Koltuk planı seçiniz.").prop("disabled", true).prop("selected", true)];
                busModels.forEach(bm => planOpts.push($("<option>").val(bm.id).html(bm.title)));
                $planEl.html(planOpts);
                if (tripBusModelId) $planEl.val(tripBusModelId);
                $planEl.off().on("change", async function () {
                    const busModelId = $(this).val();

                    $plateEl.val("");
                    $(".captain-name").html("");
                    $(".captain-phone").html("");

                    try {
                        await $.post("/post-trip-bus-plan", { tripId: currentTripId, busModelId });
                        loadTrip(currentTripDate, currentTripTime, currentTripId);
                    } catch (err) {
                        console.log(err);
                    }
                });
            } else if ($planEl.is("input")) {
                const modelTitle = busModels.find(bm => bm.id === tripBusModelId)?.title || "";
                $planEl.val(modelTitle);
            }

            if ($plateEl.is("select")) {
                const plateOpts = [$("<option>").val("").html("Plaka seçiniz.").prop("disabled", true).prop("selected", true)];
                buses.forEach(b => {
                    const busModel = busModels.find(bm => bm.id === b.busModelId);
                    const opt = $("<option>")
                        .val(b.id)
                        .html(b.licensePlate)
                        .attr("data-bus-model-id", b.busModelId)
                        .attr("data-bus-model-title", busModel ? busModel.title : "")
                        .attr("data-captain-name", b.captain ? `${b.captain.name} ${b.captain.surname}` : "")
                        .attr("data-captain-phone", b.captain ? b.captain.phoneNumber : "");
                    plateOpts.push(opt);
                });
                $plateEl.html(plateOpts);
                if (tripBusId) $plateEl.val(tripBusId);

                $plateEl.off().on("change", async function () {
                    const busId = $(this).val();
                    const selected = $(this).find("option:selected");
                    const busModelId = selected.data("bus-model-id");
                    const busModelTitle = selected.data("bus-model-title");
                    const captainName = selected.data("captain-name");
                    const captainPhone = selected.data("captain-phone");

                    if ($planEl.is("select")) {
                        $planEl.val(busModelId);
                    } else {
                        $planEl.val(busModelTitle || "");
                    }
                    $(".captain-name").html(captainName || "");
                    $(".captain-phone").html(captainPhone || "");

                    try {
                        await $.post("/post-trip-bus", { tripId: currentTripId, busId });
                        loadTrip(currentTripDate, currentTripTime, currentTripId);
                    } catch (err) {
                        console.log(err);
                    }
                });
            } else if ($plateEl.is("input")) {
                const selectedBus = buses.find(b => b.id === tripBusId);
                $plateEl.val(selectedBus ? selectedBus.licensePlate : "");
                if (selectedBus) {
                    if ($planEl.is("select")) {
                        $planEl.val(selectedBus.busModelId);
                    } else {
                        const modelTitle = busModels.find(bm => bm.id === selectedBus.busModelId)?.title || "";
                        $planEl.val(modelTitle);
                    }
                    $(".captain-name").html(selectedBus.captain ? `${selectedBus.captain.name} ${selectedBus.captain.surname}` : "");
                    $(".captain-phone").html(selectedBus.captain ? selectedBus.captain.phoneNumber : "");
                }
            }
        } catch (err) {
            console.log(err);
        }

        // Move-to listesi (ayrı istek)
        await $.ajax({
            url: "/get-route-stops-list-moving",
            type: "GET",
            data: { date, time, tripId, stopId: currentStop },
            success: function (response) {
                console.log(response);
                let arr = [];
                const opt = $("<option>").html("").val("");
                arr.push(opt);
                for (let i = 0; i < response.length; i++) {
                    const rs = response[i];
                    const opt2 = $("<option>").html(rs.stopStr).val(rs.isRestricted ? "" : rs.stopId);
                    if (rs.isRestricted) {
                        opt2.addClass("restricted");
                        opt2.prop("disabled", true);
                    }
                    arr.push(opt2);
                }
                $(".move-to-trip-place-select").html(arr);
                if (isMovingActive) {
                    $(".move-to-trip-date").html(`${new Date(currentTripDate).getDate()}/${Number(new Date(currentTripDate).getMonth()) + 1} | ${currentTripPlaceTime.split(":")[0] + "." + currentTripPlaceTime.split(":")[1]}`);
                    $(".move-to-trip-place").html(`${currentStopStr}`);
                    $(".move-to").css("display", "flex");
                }
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });

        // Dışarı tıklama → popup kapat
        $(document).on("click", function () {
            $(".ticket-ops-pop-up").hide();
            $(".taken-ticket-ops-pop-up").hide();
            currentSeat = null;
        });

        // Revenues
        $(".trip-option-revenues").off().on("click", async function (e) {
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

        // Staff
        $(".trip-option-staff").off().on("click", async function (e) {
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

        // Cargo ekleme
        $(".trip-cargo-add").off().on("click", async function () {
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

        // Cargo liste
        $(".trip-cargo-list").off().on("click", async function (e) {
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
                $(".trip-cargo-refund").off().on("click", async function (e2) {
                    e2.preventDefault();
                    e2.stopPropagation();

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
                    $button.prop("disabled", true).html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>');

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

        // Trip iptal/aktif
        $(".trip-option-cancel-trip").off().on("click", async function (e) {
            e.stopPropagation();
            if (!confirm("Seferi iptal etmek istediğinize emin misiniz?")) return;
            try {
                await $.post("/post-trip-active", { tripId: currentTripId, isActive: false });
                loadTrip(currentTripDate, currentTripTime, currentTripId);
                loadTripsList(calendar.val());
            } catch (err) {
                console.log(err);
            }
        });

        $(".trip-option-active-trip").off().on("click", async function (e) {
            e.stopPropagation();
            if (!confirm("Seferi aktif etmek istediğinize emin misiniz?")) return;
            try {
                await $.post("/post-trip-active", { tripId: currentTripId, isActive: true });
                loadTrip(currentTripDate, currentTripTime, currentTripId);
                loadTripsList(calendar.val());
            } catch (err) {
                console.log(err);
            }
        });

        // Stop restriction aç
        $(".trip-option-stop-restriction").off().on("click", function (e) {
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

        // Time change popup
        $(".trip-option-change-time").off().on("click", async function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (!currentTripId) {
                showError("Sefer bilgisi bulunamadı.");
                return;
            }

            try {
                const stops = await $.get("/get-trip-stops", { tripId: currentTripId });
                resetTripTimeAdjustForm();
                populateTripTimeAdjustStops(stops);
                $(".trip-time-adjust-pop-up").css("display", "block");
                $(".blackout").css("display", "block");
            } catch (err) {
                console.log(err);
                showError("Durak listesi alınamadı.");
            }
        });

        // Time change confirm
        $(".trip-time-adjust-confirm").off().on("click", async function () {
            if (!currentTripId) {
                showError("Sefer bilgisi bulunamadı.");
                return;
            }

            const routeStopId = $(".trip-time-adjust-stop").val();
            const direction = $("input[name='trip-time-adjust-direction']:checked").val();
            const amount = $(".trip-time-adjust-amount").val();

            if (!routeStopId) {
                showError("Lütfen bir durak seçiniz.");
                return;
            }

            if (!direction) {
                showError("Lütfen yön seçiniz.");
                return;
            }

            if (!amount) {
                showError("Lütfen süre seçiniz.");
                return;
            }

            const [hours, minutes] = amount.split(":").map(Number);
            if (Number.isNaN(hours) || Number.isNaN(minutes)) {
                showError("Geçerli bir süre giriniz.");
                return;
            }

            if (hours * 60 + minutes === 0) {
                showError("Süre 0 olamaz.");
                return;
            }

            const $button = $(this);
            if ($button.prop("disabled")) {
                return;
            }

            $button.prop("disabled", true);

            try {
                await $.post("/post-trip-time-adjustment", {
                    tripId: currentTripId,
                    routeStopId,
                    direction,
                    amount
                });
                closeTripTimeAdjustPopup();
                loadTrip(currentTripDate, currentTripTime, currentTripId);
                if (calendar && typeof calendar.val === "function") {
                    loadTripsList(calendar.val());
                }
            } catch (err) {
                console.log(err);
                const message = err?.responseJSON?.message || err?.responseText || err?.statusText || "Sefer saati güncellenemedi.";
                showError(message);
            } finally {
                $button.prop("disabled", false);
            }
        });

        // Stop restriction checkbox
        $(".trip-stop-restriction-checkbox").off().on("change", function () {
            const fromId2 = this.dataset.from;
            const toId2 = this.dataset.to;
            const key = `${fromId2}-${toId2}`;
            const initial = this.dataset.initial === "true";
            const isAllowed = this.checked;
            if (isAllowed === initial) {
                delete tripStopRestrictionChanges[key];
            } else {
                tripStopRestrictionChanges[key] = isAllowed;
            }
            tripStopRestrictionDirty = Object.keys(tripStopRestrictionChanges).length > 0;
        });

        // Stop restriction save
        $(".trip-stop-restriction-save").off().on("click", async function () {
            const entries = Object.entries(tripStopRestrictionChanges);
            if (entries.length === 0) {
                closeTripStopRestriction();
                return;
            }
            try {
                await Promise.all(entries.map(([key, isAllowed]) => {
                    const [fromId3, toId3] = key.split("-");
                    return $.post("/post-trip-stop-restriction", {
                        tripId: currentTripId,
                        fromId: fromId3,
                        toId: toId3,
                        isAllowed: isAllowed ? 1 : 0
                    });
                }));
                entries.forEach(([key, isAllowed]) => {
                    const [fromId3, toId3] = key.split("-");
                    const checkbox = document.querySelector(`.trip-stop-restriction-checkbox[data-from='${fromId3}'][data-to='${toId3}']`);
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

        // Ticket operations menüsü aç/kapat
        $(".ticket-op").on("click", e => {
            e.stopPropagation();
            $(".ticket-op ul").css("display", "none");
            const ul = e.currentTarget.querySelector("ul");
            const isVisible = $(ul).css("display") === "flex";
            if (!isVisible) {
                $(ul).css("display", "flex");
            }
        });

        // (Dikkat: bu satır önceki document click handler'ını kaldırır)
        $(document).off("click").on("click", () => {
            $(".ticket-op ul").css("display", "none");
        });

        // Ticket-op butonu
        $(".ticket-op-button").on("click", async e => {
            const button = e.currentTarget;
            const action = e.currentTarget.dataset.action;
            const fromIdLocal = currentStop;
            const toIdLocal = button.dataset.stopId;

            for (let i = 0; i < selectedSeats.length; i++) {
                const seat = selectedSeats[i];
                seatTypes.push($(`.seat-${seat}`).data("seat-type"));
            }

            $(".ticket-ops-pop-up").hide();

            try {
                await $.ajax({
                    url: "/get-ticket-row",
                    type: "GET",
                    data: {
                        action: e.currentTarget.dataset.action,
                        gender: button.dataset.gender,
                        seats: selectedSeats,
                        seatTypes: seatTypes,
                        fromId: fromIdLocal,
                        toId: toIdLocal,
                        date: currentTripDate,
                        time: currentTripTime,
                        tripId: currentTripId,
                        stopId: currentStop
                    },
                    success: function (response) {
                        $(".ticket-info-pop-up_from").html(currentStopStr.toLocaleUpperCase());
                        $(".ticket-info-pop-up_to").html(button.dataset.routeStop.toLocaleUpperCase());
                        $(".ticket-row").remove();
                        $(".ticket-info").remove();
                        $(".ticket-button-action").attr("data-action", action);
                        $(".ticket-button-action").html(action == "sell" ? "SAT" : "REZERVE ET");
                        $(".ticket-rows").prepend(response);

                        seatTypes = [];

                        initTcknInputs(".identity input");
                        initPhoneInput(".phone input");
                        initializeTicketRowPriceControls();

                        $(".identity input").on("blur", async e2 => {
                            const customer = await $.ajax({ url: "/get-customer", type: "GET", data: { idNumber: e2.currentTarget.value } });
                            if (customer) {
                                const row = e2.currentTarget.parentElement.parentElement;
                                const rows = [...document.querySelectorAll('.ticket-row')];
                                const originalPrice = originalPrices[rows.indexOf(e2.currentTarget.closest('.ticket-row'))];
                                $(row).find(".name").find("input").val(customer.name);
                                $(row).find(".surname").find("input").val(customer.surname);
                                $(row).find(".category").find("input").val(customer.customerCategory);
                                $(row).find(".type").find("input").val(customer.customerType);
                                $(row).find(".nationality").find("input").val(customer.nationality);
                                $(row).find(".price").find("span.customer-point")
                                    .html(customer.pointOrPercent == "point" ? customer.point_amount + " p" : customer.percent + "%")
                                    .addClass("text-danger")
                                    .data("pointorpercent", customer.pointOrPercent)
                                    .data("pointamount", customer.point_amount);
                                $(row).find(".price").find("input").val(originalPrice);
                                if (customer.pointOrPercent == "percent") {
                                    const discount = Number(customer.percent);
                                    const newPrice = originalPrice - (originalPrice / 100 * discount);
                                    $(row).find(".price").find("input").val(newPrice);
                                } else if (!customer.pointOrPercent) {
                                    $(row).find(".price").find("span.customer-point")
                                        .html("")
                                        .removeClass("text-danger")
                                        .data("pointorpercent", "")
                                        .data("pointamount", "");
                                }
                                if (customer.gender == "m") {
                                    $(row).find(".gender").find("input.male").prop("checked", true);
                                    $(row).find(".gender").find("input.female").prop("checked", false);
                                    $(row).addClass("m").removeClass("f");
                                } else if (customer.gender == "f") {
                                    $(row).find(".gender").find("input.male").prop("checked", false);
                                    $(row).find(".gender").find("input.female").prop("checked", true);
                                    $(row).addClass("f").removeClass("m");
                                }
                                $(".ticket-rows").find(".phone").find("input").val(customer.phoneNumber);
                                updateTicketRowsSumPrice();
                            }
                        });

                        $(".ticket-info-pop-up").css("display", "block");
                        $(".blackout").css("display", "block");

                        flatpickr($(".reservation-expire input.changable.date"), {
                            locale: "tr",
                            altInput: true,
                            altFormat: "d F Y",
                        });
                        flatpickr($(".reservation-expire input.changable.time"), {
                            locale: "tr",
                            enableTime: true,
                            noCalendar: true,
                        });

                        $(document).on("change", ".ticket-row input[type='radio']", function () {
                            const $row = $(this).closest(".ticket-row");
                            $row.removeClass("m f");
                            if ($(this).val() === "m") {
                                $row.addClass("m");
                            } else if ($(this).val() === "f") {
                                $row.addClass("f");
                            }
                        });

                        $(".price-arrow").off().on("click", function (e3) {
                            e3.preventDefault();

                            const $button = $(this);
                            const isUp = $button.hasClass("price-arrow-up");
                            const $priceContainer = $button.closest(".price");
                            const priceLists = getPriceLists($priceContainer);
                            const options = priceLists.activeList;

                            if (!options.length) {
                                return;
                            }

                            const $row = $button.closest(".ticket-row");
                            const rowIndex = $(".ticket-row").index($row);
                            const $input = $priceContainer.find("input").first();

                            const currentValue = Number($input.val());
                            let currentIndex = options.findIndex(p => Number(p) === currentValue);

                            if (currentIndex === -1 && rowIndex > -1) {
                                const originalPrice = originalPrices[rowIndex];
                                if (originalPrice !== undefined && originalPrice !== null) {
                                    currentIndex = options.findIndex(p => Number(p) === Number(originalPrice));
                                }
                            }

                            let nextIndex;
                            if (currentIndex === -1) {
                                nextIndex = isUp ? 0 : options.length - 1;
                            } else if (isUp) {
                                nextIndex = (currentIndex + 1) % options.length;
                            } else {
                                nextIndex = (currentIndex - 1 + options.length) % options.length;
                            }

                            const newBasePrice = Number(options[nextIndex]);
                            if (Number.isNaN(newBasePrice)) return;

                            if (rowIndex > -1) {
                                originalPrices[rowIndex] = newBasePrice;
                            }

                            let finalPrice = newBasePrice;
                            const $discountInfo = $priceContainer.find("span.customer-point");
                            const pointOrPercent = $discountInfo.data("pointorpercent");

                            if (pointOrPercent === "percent") {
                                const percentText = ($discountInfo.text() || "").trim();
                                const percentMatch = percentText.match(/-?\d+(?:[.,]\d+)?/);
                                if (percentMatch) {
                                    const percentValue = parseFloat(percentMatch[0].replace(",", "."));
                                    if (!Number.isNaN(percentValue)) {
                                        finalPrice = newBasePrice - ((newBasePrice / 100) * percentValue);
                                    }
                                }
                            }

                            $input.val(finalPrice);
                            if ($input.length && $input[0]) {
                                const inputEvent = new Event("input", { bubbles: true });
                                const changeEvent = new Event("change", { bubbles: true });
                                $input[0].dispatchEvent(inputEvent);
                                $input[0].dispatchEvent(changeEvent);
                            }
                        });

                        $(".seat").removeClass("selected");
                    }
                });
            } catch (err) {
                seatTypes = [];
                const message =
                    err?.responseJSON?.message ||
                    err?.responseJSON?.error ||
                    err?.responseText ||
                    err?.statusText ||
                    err?.message ||
                    "Bilinmeyen hata";
                showError(message);
            }
        });

        // Seat hover popup
        $(".seat").off("mouseenter").on("mouseenter", function (e) {
            const data = e.currentTarget.dataset;

            const rect = this.getBoundingClientRect();
            const popupLeft = rect.right + window.scrollX + 10;
            const popupTop = rect.top + window.scrollY;

            $(".passenger-info-popup .name-phone-container").css("display", "block");
            $(".passenger-info-popup .price-container").css("display", "block");
            $(".passenger-info-popup .payment-container").css("display", "block");
            $(".passenger-info-popup .pnr-container").css("display", "block");
            $(".passenger-info-popup .take-on-container").css("display", "block");
            $(".passenger-info-popup .take-off-container").css("display", "block");
            if (data.createdAt) {
                $(".passenger-info-popup").removeClass("m").removeClass("f").removeClass("p");
                if (data.status == "pending") {
                    $(".passenger-info-popup").addClass("p");
                    $(".passenger-info-popup .name-phone-container").css("display", "none");
                    $(".passenger-info-popup .price-container").css("display", "none");
                    $(".passenger-info-popup .payment-container").css("display", "none");
                    $(".passenger-info-popup .pnr-container").css("display", "none");
                    $(".passenger-info-popup .take-on-container").css("display", "none");
                    $(".passenger-info-popup .take-off-container").css("display", "none");
                }
                else {
                    $(".passenger-info-popup").addClass(data.gender);
                    const hasTakeOn = Boolean(data.takeOn);
                    const hasTakeOff = Boolean(data.takeOff);
                    $(".passenger-info-popup .take-on-container").css("display", hasTakeOn ? "block" : "none");
                    $(".passenger-info-popup .take-off-container").css("display", hasTakeOff ? "block" : "none");
                }
                $(".passenger-info-popup .seat-number").html(data.seatNumber);
                $(".passenger-info-popup .from").html(data.from);
                $(".passenger-info-popup .to").html(data.to);
                $(".passenger-info-popup .name").html(data.name);
                $(".passenger-info-popup .username").html(data.userName);
                $(".passenger-info-popup .userBranch").html(data.branch);
                $(".passenger-info-popup .phone").html(data.phone);
                $(".passenger-info-popup .take-on").html(data.takeOn || "");
                $(".passenger-info-popup .take-off").html(data.takeOff || "");
                $(".passenger-info-popup .price").html(data.price ? data.price + "₺" : "");
                $(".passenger-info-popup .payment").html(data.payment == "cash" ? "Nakit" : data.payment == "card" ? "Kredi Kartı" : data.payment == "point" ? "Puan" : "");
                $(".passenger-info-popup .pnr").html(data.pnr ? data.pnr : "");
                const date2 = new Date(data.createdAt);
                $(".passenger-info-popup .createdAt").html(date2.toLocaleDateString() + " " + date2.toLocaleTimeString());

                $(".passenger-info-popup").css({
                    left: popupLeft + "px",
                    top: popupTop + "px",
                    display: "block"
                });
            }
        });

        $(".seat").off("mouseleave").on("mouseleave", function () {
            $(".passenger-info-popup").hide();
        });

        // Hesap kesim aç
        $(".account-cut").off().on("click", async () => {
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
                for (let i = 1; i <= 5; i++) {
                    $(".account-cut-deductions-popup .account-deduction" + i).val("");
                    $(".account-cut-popup .account-deduction" + i).val("");
                }
                $(".account-cut-deductions-popup .account-tip").val("");
                $(".account-cut-popup .account-tip").val("");
                if (Array.isArray(accountCutData.defaultDeductions)) {
                    accountCutData.defaultDeductions.forEach((value, index) => {
                        const selector = ".account-cut-deductions-popup .account-deduction" + (index + 1);
                        if (value === null || value === undefined || value === "") {
                            $(selector).val("");
                            return;
                        }
                        const numeric = Number(value);
                        if (Number.isFinite(numeric)) {
                            $(selector).val(numeric.toFixed(2));
                        } else {
                            $(selector).val(value);
                        }
                    });
                }
            } catch (err) {
                console.log(err);
            }
            $(".account-cut-deductions-popup").css("display", "block");
            $(".blackout").css("display", "block");
        });

        // Hesap kesim çıktı
        $(".accountCut").off().on("click", e => {
            e.preventDefault();
            window.open(`/get-bus-account-cut-receipt?tripId=${currentTripId}&stopId=${currentStop}`, "_blank", "width=800,height=600");
        });

        // Koltuk planı raporu
        $(".trip-seat-plan-report").off().on("click", e => {
            e.preventDefault();
            if (!currentTripId) return;
            const params = new URLSearchParams({ tripId: currentTripId });
            if (currentStop !== undefined && currentStop !== null && currentStop !== "") {
                params.append("stopId", currentStop);
            }
            window.open(`/trip-seat-plan?${params.toString()}`, "_blank", "width=900,height=700");
        });

        // Hesap kesim geri al
        $(".account-cut-undo").off().on("click", async () => {
            try {
                const data2 = await $.ajax({
                    url: "/get-bus-account-cut-record",
                    type: "GET",
                    data: { tripId: currentTripId, stopId: currentStop }
                });
                accountCutId = data2.id;
                $(".account-cut-popup .my-cash").val(Number(data2.myCash).toFixed(2));
                $(".account-cut-popup .my-card").val(Number(data2.myCard).toFixed(2));
                $(".account-cut-popup .other-branches").val(Number(data2.otherBranches).toFixed(2));
                $(".account-cut-popup .all-total").val(Number(data2.allTotal).toFixed(2));
                $(".account-cut-popup .account-commission").val(Number(data2.comissionAmount).toFixed(2));
                for (let i = 1; i <= 5; i++) {
                    $(".account-cut-popup .account-deduction" + i).val(data2["deduction" + i]);
                }
                $(".account-cut-popup .account-tip").val(data2.tip);
                $(".account-cut-popup .account-description").val(data2.description);
                $(".account-cut-popup .account-needtopay").val(Number(data2.needToPay).toFixed(2));
                $(".account-cut-popup .account-payed").val(Number(data2.payedAmount).toFixed(2));
                $(".account-cut-popup .account-deduction1, .account-cut-popup .account-deduction2, .account-cut-popup .account-deduction3, .account-cut-popup .account-deduction4, .account-cut-popup .account-deduction5, .account-cut-popup .account-tip, .account-cut-popup .account-description, .account-cut-popup .account-payed").prop("readonly", true);
                $(".account-cut-save").hide();
                $(".account-cut-undo-btn").show();
                $(".account-cut-popup").css("display", "block");
                $(".blackout").css("display", "block");
            } catch (err) {
                console.log(err);
            }
        });

        // Hesap kesim geri al butonu
        $(".account-cut-undo-btn").off().on("click", async () => {
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

        // Hesap kesim kesintileri popup cancel/continue
        $(".account-cut-deductions-cancel").off().on("click", () => {
            $(".account-cut-deductions-popup").css("display", "none");
            $(".blackout").css("display", "none");
        });

        $(".account-cut-deductions-continue").off().on("click", () => {
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

        $(".account-cut-close").off().on("click", () => {
            $(".account-cut-popup").css("display", "none");
            $(".blackout").css("display", "none");
        });

        $(".account-cut-save").off("click").on("click", async () => {
            const data3 = {
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
                await $.ajax({ url: "/post-bus-account-cut", type: "POST", data: data3 });
                window.open(`/get-bus-account-cut-receipt?tripId=${currentTripId}&stopId=${currentStop}`, "_blank", "width=800,height=600");
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

    } catch (error) {
        console.log(error);
    }
}

function normalizeDateString(value) {
    if (!value) return "";

    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    const str = String(value).trim();
    if (!str) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }

    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) {
        return "";
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function normalizeTimeString(value) {
    if (value === undefined || value === null) {
        return "";
    }

    const str = String(value).trim();
    if (!str) return "";

    if (/^\d{2}:\d{2}:\d{2}$/.test(str)) {
        return str;
    }

    if (/^\d{2}:\d{2}$/.test(str)) {
        return `${str}:00`;
    }

    if (/^\d{1,2}\.\d{1,2}$/.test(str)) {
        const [hours, minutes] = str.split(".");
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
    }

    const parts = str.split(":");
    if (parts.length >= 2) {
        const [hours = "0", minutes = "0", seconds = "0"] = parts;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return str;
}

function formatDateForRequest(dateInput) {
    if (dateInput instanceof Date) {
        return normalizeDateString(dateInput);
    }

    if (typeof dateInput === "string") {
        const normalized = normalizeDateString(dateInput);
        return normalized || dateInput.trim();
    }

    return dateInput;
}

function getTripDateFromRow($row) {
    const date = normalizeDateString($row.data("date"));
    const time = normalizeTimeString($row.data("time"));

    if (!date || !time) {
        return null;
    }

    const parsed = new Date(`${date}T${time}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function selectTripRow($row) {
    $(".tripRow").removeClass("selected");
    if ($row && $row.length) {
        $row.addClass("selected");
    }
}

function findTripRow($rows, criteria = {}) {
    const { date, time, tripId } = criteria;
    const targetId = tripId != null ? String(tripId) : null;
    const targetDate = normalizeDateString(date);
    const targetTime = normalizeTimeString(time);

    return $rows.filter((_, el) => {
        const $row = $(el);
        if (targetId !== null && String($row.data("tripid")) !== targetId) {
            return false;
        }

        if (targetDate && normalizeDateString($row.data("date")) !== targetDate) {
            return false;
        }

        if (targetTime && normalizeTimeString($row.data("time")) !== targetTime) {
            return false;
        }

        return true;
    }).first();
}

function findCurrentTripRow($rows) {
    if (!currentTripId) {
        return $();
    }

    return findTripRow($rows, {
        date: currentTripDate,
        time: currentTripTime,
        tripId: currentTripId
    });
}

function findClosestUpcomingTripRow($rows) {
    const now = new Date();
    let bestElement = null;
    let bestDiff = Infinity;

    $rows.each((_, el) => {
        const $row = $(el);
        if ($row.hasClass("disabled") || $row.hasClass("expired")) {
            return;
        }

        const tripDate = getTripDateFromRow($row);
        if (!tripDate) {
            return;
        }

        const diff = tripDate.getTime() - now.getTime();
        if (diff < 0) {
            return;
        }

        if (diff < bestDiff) {
            bestDiff = diff;
            bestElement = el;
        }
    });

    return bestElement ? $(bestElement) : $();
}

function highlightTripRowByData(date, time, tripId) {
    const $rows = $(".tripRow");
    if (!$rows.length) {
        return;
    }

    const $target = findTripRow($rows, { date, time, tripId });
    if ($target.length) {
        selectTripRow($target);
    }
}

async function renderTripRows(html, options = {}) {
    const { autoSelect = false } = options || {};

    $(".tripRows").html(html);

    const $rows = $(".tripRow");

    $rows.off("click").on("click", async e => {
        const $row = $(e.currentTarget);
        selectTripRow($row);

        const date = $row.data("date");
        const time = $row.data("time");
        const tripId = $row.data("tripid");

        if (!date || !time || tripId === undefined) {
            return;
        }

        try {
            await loadTrip(date, time, tripId);
        } catch (err) {
            console.error(err);
        }
    });

    const bindTripActivationButtons = ($buttons, isActive) => {
        $buttons.off("click").on("click", async function (e) {
            e.preventDefault();
            e.stopPropagation();

            const $button = $(this);
            const tripId = Number($button.data("tripId"))
                || Number($button.closest(".btn-group").find(".trip-button").data("id"));

            if (!tripId) {
                showError("Sefer bilgisi bulunamadı.");
                return;
            }

            const confirmMessage = isActive
                ? "Seferi aktif etmek istediğinize emin misiniz?"
                : "Seferi iptal etmek istediğinize emin misiniz?";

            if (!window.confirm(confirmMessage)) {
                return;
            }

            const originalHtml = $button.html();
            const originalDisabled = $button.prop("disabled");
            $button.prop("disabled", true).html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>');

            try {
                await $.post("/post-trip-active", { tripId, isActive });

                if (currentTripId === tripId && currentTripDate && currentTripTime) {
                    try {
                        await loadTrip(currentTripDate, currentTripTime, currentTripId);
                    } catch (err) {
                        console.error(err);
                    }
                }

                const calendarValue = typeof calendar !== "undefined"
                    && calendar
                    && typeof calendar.val === "function"
                    ? calendar.val()
                    : null;

                let dateInput = new Date();
                if (calendarValue) {
                    if (typeof calendarValue === "string" && calendarValue.trim()) {
                        dateInput = calendarValue;
                    } else if (calendarValue instanceof Date) {
                        dateInput = calendarValue;
                    }
                }

                await loadTripsList(dateInput, { autoSelect: false });
            } catch (err) {
                showError(getAjaxErrorMessage(err));
            } finally {
                if ($button.closest("body").length) {
                    $button.prop("disabled", originalDisabled).html(originalHtml);
                }
            }
        });
    };

    bindTripActivationButtons($(".trip-cancel-button"), false);
    bindTripActivationButtons($(".trip-active-button"), true);

    const $current = findCurrentTripRow($rows);
    if ($current.length) {
        selectTripRow($current);
        return false;
    }

    if (!autoSelect) {
        return false;
    }

    const $next = findClosestUpcomingTripRow($rows);
    if ($next.length) {
        selectTripRow($next);
        try {
            await loadTrip($next.data("date"), $next.data("time"), $next.data("tripid"));
        } catch (err) {
            console.error(err);
        }
        return true;
    }

    return false;
}

// Site ilk açıldığında bugünün seferini yükler ve en yakın aktif seferi açar
$(document).ready(function () {
    loadTripsList(new Date(), { autoSelect: true });
})

// Sefer listesini yükler
async function loadTripsList(dateInput, options = {}) {
    const formattedDate = formatDateForRequest(dateInput);

    await $.ajax({
        url: "/get-day-trips-list",
        type: "GET",
        data: { date: formattedDate, stopId: currentStop, tripId: currentTripId },
        success: async function (response) {
            await renderTripRows(response, options);
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
    defaultDate: new Date(),
    onChange: async function (selectedDates, dateStr, instance) {
        loadTripsList(dateStr, { autoSelect: true })
    },
})
const tripCalendar = $(".trip-settings-calendar")
flatpickr(tripCalendar, {
    locale: "tr",
    defaultDate: new Date(),
    altInput: true,
    altFormat: "d F Y",
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
    defaultDate: new Date(),
    altInput: true,
    altFormat: "d F Y",
})
const tripLastDate = $(".trip-last-date")
flatpickr(tripLastDate, {
    locale: "tr",
    defaultDate: new Date(),
    altInput: true,
    altFormat: "d F Y",
})

const tripTimeAdjustInput = document.querySelector(".trip-time-adjust-amount")
if (tripTimeAdjustInput) {
    tripTimeAdjustPicker = flatpickr(tripTimeAdjustInput, {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        time_24hr: true,
        defaultDate: "00:15",
        minuteIncrement: 1
    })
}

let currentSeat = null;

const getTrimmedValue = value => {
    if (value === undefined || value === null) {
        return "";
    }

    if (typeof value === "string") {
        return value.trim();
    }

    return String(value).trim();
};

const validateTicketForm = action => {
    if (!action) {
        return true;
    }

    const $rows = $(".ticket-row");
    const phoneValue = getTrimmedValue($(".ticket-rows .phone input").val());

    if ((action === "reservation" || action === "sell") && !phoneValue) {
        showError("Lütfen telefon numarası giriniz.");
        return false;
    }

    if (action === "reservation" || action === "sell") {
        for (let i = 0; i < $rows.length; i++) {
            const $row = $rows.eq(i);

            const nameValue = getTrimmedValue($row.find(".name input").val());
            if (!nameValue) {
                showError("Lütfen isim giriniz.");
                return false;
            }

            const surnameValue = getTrimmedValue($row.find(".surname input").val());
            if (!surnameValue) {
                showError("Lütfen soyisim giriniz.");
                return false;
            }

            if (action === "sell") {
                const idNumberValue = getTrimmedValue($row.find(".identity input").val());
                if (!idNumberValue) {
                    showError("Lütfen kimlik numarası giriniz.");
                    return false;
                }
            }
        }
    }

    if (action === "sell") {
        const $reservationWrapper = $(".ticket-rows .reservation-expire");

        if ($reservationWrapper.length) {
            const $dateInput = $reservationWrapper.find("input.date");
            if ($dateInput.length && !getTrimmedValue($dateInput.val())) {
                showError("Lütfen rezervasyon opsiyon tarihini giriniz.");
                return false;
            }

            const $timeInput = $reservationWrapper.find("input.time");
            if ($timeInput.length && !getTrimmedValue($timeInput.val())) {
                showError("Lütfen rezervasyon opsiyon saatini giriniz.");
                return false;
            }
        }
    }

    return true;
};

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

    try {
        const response = await $.ajax({
            url: "/get-day-trips-list",
            type: "GET",
            data: { date: calendar.val(), stopId: currentStop }
        });

        const autoLoaded = await renderTripRows(response, { autoSelect: true });
        if (currentTripId && !autoLoaded) {
            await loadTrip(currentTripDate, currentTripTime, currentTripId);
        }
    } catch (err) {
        console.log(err);
    }
});


// Bilet kesim ekranındaki onaylama tuşu
$(".ticket-button-action").on("click", async e => {
    const action = e.currentTarget.dataset.action;

    if ((action === "reservation" || action === "sell") && !validateTicketForm(action)) {
        return;
    }

    if (action == "sell") {
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
            const takeOnValue = ($(".ticket-rows").find(".take-on select").val() || "").toString().trim();
            const takeOffValue = ($(".ticket-rows").find(".take-off select").val() || "").toString().trim();

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
                    takeOn: takeOnValue,
                    takeOff: takeOffValue,
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
                    const message = xhr?.responseJSON?.message || xhr?.responseText || error;
                    showError(message);
                }
            });
        }
    }
    else if (action == "complete") {
        let tickets = []
        const takeOnValue = ($(".ticket-rows").find(".take-on select").val() || "").toString().trim();
        const takeOffValue = ($(".ticket-rows").find(".take-off select").val() || "").toString().trim();

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
                takeOn: takeOnValue,
                takeOff: takeOffValue,
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
    else if (action == "sell_open") {
        let tickets = []
        const fromId = $(".open-ticket-from").val()
        const toId = $(".open-ticket-to").val()
        const takeOnValue = ($(".ticket-rows").find(".take-on select").val() || "").toString().trim();
        const takeOffValue = ($(".ticket-rows").find(".take-off select").val() || "").toString().trim();

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
                takeOn: takeOnValue,
                takeOff: takeOffValue,
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
    else if (action == "edit") {

        const ticket = $(".ticket-row")

        let ticketArray = []
        const takeOnValue = ($(".ticket-rows").find(".take-on select").val() || "").toString().trim();
        const takeOffValue = ($(".ticket-rows").find(".take-off select").val() || "").toString().trim();

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
                takeOn: takeOnValue,
                takeOff: takeOffValue,
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
    else if (action == "reservation") {
        let tickets = []
        const takeOnValue = ($(".ticket-rows").find(".take-on select").val() || "").toString().trim();
        const takeOffValue = ($(".ticket-rows").find(".take-off select").val() || "").toString().trim();

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
                takeOn: takeOnValue,
                takeOff: takeOffValue,
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
                const message = xhr?.responseJSON?.message || xhr?.responseText || error;
                showError(message);
            }
        });

    }
    else if (action == "cancel") {

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
    else if (action == "refund") {

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
    else if (action == "open") {

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
                initializeTicketRowPriceControls()

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
                    altInput: true,
                    altFormat: "d F Y",
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
                initializeTicketRowPriceControls()

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
                    altInput: true,
                    altFormat: "d F Y",
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
            const message = xhr?.responseJSON?.message || xhr?.responseText || error;
            showError(message);
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

$(".trip-stop-restriction-close").off().on("click", () => {
    closeTripStopRestriction();
});

function closeTripTimeAdjustPopup() {
    resetTripTimeAdjustForm();
    $(".trip-time-adjust-pop-up").css("display", "none");
    $(".blackout").css("display", "none");
}

$(document)
    .off("click", ".trip-time-adjust-close, .trip-time-adjust-cancel")
    .on("click", ".trip-time-adjust-close, .trip-time-adjust-cancel", () => {
        closeTripTimeAdjustPopup();
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
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });
    }
    selectedSeats = []
    $("#pendingIds").remove()
    loadTrip(currentTripDate, currentTripTime, currentTripId)
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
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });
    }
    selectedSeats = []
    $("#pendingIds").remove()
    loadTrip(currentTripDate, currentTripTime, currentTripId)
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

$(document).on("click", ".note-edit", e => {
    const noteEl = $(e.currentTarget).closest(".note");
    editingNoteId = noteEl.data("id");
    const text = noteEl.find(".note-text").text();
    $(".add-trip-note .gtr-header span").html("NOTU DÜZENLE")
    $("button.save-trip-note").html("DÜZENLE")
    $(".trip-note-text").val(text);
    $(".blackout").css("display", "block");
    $(".add-trip-note").css("display", "flex");
})

$(document).on("click", ".note-delete", async e => {
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

    if (!fromId || !toId) {
        showError("Lütfen nereden ve nereye bilgilerini seçiniz.")
        return
    }

    if (!count || Number(count) <= 0) {
        showError("Lütfen bilet adedi için 0'dan büyük bir değer giriniz.")
        return
    }

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
            initializeTicketRowPriceControls()
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
    $(".search-name").val("")
    $(".search-surname").val("")
    $(".search-idnum").val("")
    $(".search-phone").val("")
    $(".search-pnr").val("")
    $(".search-status").val("")
    $(".searched-table").html("")

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

$(".searched-table tbody tr").off().on("click", function (e) {
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

$(".searched-ticket-op[data-action='go_trip']").off().on("click", async e => {
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
    $(".transaction-amount").val("")
    $(".transaction-description").val("")
    $(".add-transaction").css("display", "block")
    $(".register").css("z-index", 9)
    $(".blackout").css("display", "block")
})

$(".add-expense-nav").on("click", async e => {
    transactionType = "expense"
    $(".transaction-amount").val("")
    $(".transaction-description").val("")
    $(".add-transaction").css("display", "block")
    $(".blackout").css("display", "block")
    $(".register").css("z-index", 9)
})

$(".add-transaction-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".add-transaction").css("display", "none")
})

$(".add-transaction-button").on("click", async e => {
    const rawAmount = ($(".transaction-amount").val() || "").toString().trim()
    const normalizedAmount = Number(rawAmount.replace(",", "."))
    const description = ($(".transaction-description").val() || "").toString().trim()

    if (Number.isNaN(normalizedAmount) || normalizedAmount <= 0) {
        showError("Lütfen 0'dan büyük bir miktar giriniz.")
        return
    }

    if (!description) {
        showError("Lütfen bir açıklama giriniz.")
        return
    }

    await $.ajax({
        url: "/post-add-transaction",
        type: "POST",
        data: { transactionType, amount: normalizedAmount, description },
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

let busTransactionType = null;

const loadBusTransactions = async busId => {
    if (!busId) {
        $(".bus-transaction-list").html('<p class="text-center text-muted mb-0">Otobüs seçiniz.</p>');
        return;
    }

    try {
        const response = await $.ajax({
            url: "/get-bus-transactions",
            type: "GET",
            data: { busId }
        });
        $(".bus-transaction-list").html(response);
    } catch (err) {
        const message = err?.responseJSON?.message || err?.responseText || err?.statusText || err?.message;
        showError(message || "İşlem listesi alınamadı.");
    }
};

const openBusTransactionModal = async type => {
    busTransactionType = type;
    const title = type === "income" ? "OTOBÜS GELİRİ EKLE" : "OTOBÜS GİDERİ EKLE";
    const buttonLabel = type === "income" ? "GELİR EKLE" : "GİDER EKLE";
    $(".bus-transaction-title").text(title);
    $(".bus-transaction-button").text(buttonLabel);

    const select = $(".bus-transaction-bus");
    select.empty();
    select.append('<option value="">Otobüs Seç</option>');

    try {
        const buses = await $.ajax({ url: "/get-buses-data", type: "GET" });
        buses.forEach(b => {
            const plate = b.licensePlate ? b.licensePlate : `Otobüs #${b.id}`;
            select.append(`<option value="${b.id}">${plate}</option>`);
        });
    } catch (err) {
        const message = err?.responseJSON?.message || err?.responseText || err?.statusText || err?.message;
        showError(message || "Otobüs listesi alınamadı.");
    }

    $(".bus-transaction-amount").val("");
    $(".bus-transaction-description").val("");
    $(".bus-transaction-list").html('<p class="text-center text-muted mb-0">Otobüs seçiniz.</p>');

    $(".bus-transaction").css("display", "block");
    $(".blackout").css("display", "block");
};

const closeBusTransactionModal = () => {
    busTransactionType = null;
    $(".bus-transaction").css("display", "none");
    $(".blackout").css("display", "none");
};

$(".bus-income-nav").on("click", async e => {
    e.preventDefault();
    await openBusTransactionModal("income");
});

$(".bus-expense-nav").on("click", async e => {
    e.preventDefault();
    await openBusTransactionModal("expense");
});

$(".bus-transaction-close").on("click", e => {
    e.preventDefault();
    closeBusTransactionModal();
});

$(".bus-transaction-bus").on("change", async e => {
    const busId = $(e.target).val();
    await loadBusTransactions(busId);
});

$(".bus-transaction-button").on("click", async e => {
    e.preventDefault();
    const busId = $(".bus-transaction-bus").val();
    const amountRaw = $(".bus-transaction-amount").val();
    const description = $(".bus-transaction-description").val();

    if (!busTransactionType) {
        showError("İşlem tipi belirlenemedi.");
        return;
    }

    if (!busId) {
        showError("Lütfen bir otobüs seçiniz.");
        return;
    }

    if (!amountRaw || isNaN(Number(amountRaw))) {
        showError("Geçerli bir tutar giriniz.");
        return;
    }

    if (!description || !description.trim()) {
        showError("Lütfen bir açıklama giriniz.");
        return;
    }

    try {
        await $.ajax({
            url: "/post-add-bus-transaction",
            type: "POST",
            data: {
                transactionType: busTransactionType,
                busId,
                amount: amountRaw,
                description
            }
        });

        $(".bus-transaction-amount").val("");
        $(".bus-transaction-description").val("");
        await loadBusTransactions(busId);
    } catch (err) {
        const message = err?.responseJSON?.message || err?.responseText || err?.statusText || err?.message;
        showError(message || "İşlem kaydedilemedi.");
    }
});

let activeBusPlanCount = 0

$(".bus-plans-nav").on("click", async e => {
    $(".bus-plan-panel").html("")

    const list = $(".bus-plan-list")
    list.empty()
    await $.ajax({
        url: "/get-bus-models-data",
        type: "GET",
        success: function (busModels) {
            activeBusPlanCount = Array.isArray(busModels) ? busModels.length : 0
            busModels.forEach(b => {
                list.append(`
                    <div class="btn-group w-100">
                        <button type="button" class="btn btn-outline-primary bus-plan-button d-flex col-11" data-id="${b.id}" data-title="${b.title}">
                            <div class="col-6"><p class="text-center mb-0">${b.title}</p></div>
                            <div class="col-6"><p class="text-center mb-0">${b.description}</p></div>
                        </button>
                        <button type="button" class="btn btn-outline-danger bus-plan-delete col-1" data-id="${b.id}" data-title="${b.title}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `)
            })
            $(".bus-plan-delete").on("click", async function (e) {
                e.preventDefault()
                e.stopPropagation()

                if (activeBusPlanCount <= 1) {
                    window.alert("Bir adet otobüs planınız varken silemezsiniz. Bu planı silmek için yeni otobüs planı ekleyin.")
                    return
                }

                const $button = $(this)
                const title = $button.data("title")
                window.alert("Bu otobüs planını silerseniz bu planı kullanan otobüs ve seferler de etkilenecektir.")
                const message = `${title || "Bu planı"} silmek istediğinize emin misiniz?`
                if (message && !window.confirm(message)) {
                    return
                }

                try {
                    const data = { id: $button.data("id") }
                    await $.ajax({ url: "/post-delete-bus-plan", type: "POST", data })
                    const id = String($button.data("id"))
                    if (String(editingBusPlanId) === id) {
                        editingBusPlanId = null
                        $(".bus-plan-panel").html("")
                    }
                    $button.closest(".btn-group").remove()
                    activeBusPlanCount = Math.max(0, activeBusPlanCount - 1)
                } catch (err) {
                    showError(getAjaxErrorMessage(err))
                }
            })
            $(".bus-plan-button").off("click").on("click", async e => {
                const id = e.currentTarget.dataset.id
                editingBusPlanId = id

                await $.ajax({
                    url: "/get-bus-plan-panel",
                    type: "GET",
                    data: { id: id },
                    success: function (response) {
                        $(".bus-plan-panel").html(response)

                        attachBusPlanInputEvents()

                        $(".save-bus-plan").off("click").on("click", async e => {
                            const title = $(".bus-plan-title").val()
                            const description = $(".bus-plan-description").val()

                            if (areAllBusPlanInputsEmpty() && (!title || !title.trim() || !description || !description.trim())) {
                                showError("Otobüs planı boşken isim ve açıklama alanları boş bırakılamaz.")
                                return
                            }

                            let maxPassenger = 0;
                            let plan = []
                            let planBinary = ""
                            $(".bus-plan-create-input").each((i, e) => {
                                plan.push(e.value ? e.value : 0)
                                if (e.value && e.value !== "Ş" && e.value !== ">") {
                                    planBinary = `${planBinary}${1}`
                                    maxPassenger += 1;
                                }
                                else {
                                    planBinary = `${planBinary}${0}`
                                }
                            })

                            const planJSON = JSON.stringify(plan)

                            await $.ajax({
                                url: "/post-save-bus-plan",
                                type: "POST",
                                data: { id, title, description, plan: planJSON, planBinary, maxPassenger },
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

const normalizeBusPlanInputValue = rawValue => {
    if (rawValue === undefined || rawValue === null) {
        return ""
    }

    const trimmedValue = rawValue.toString().trim()
    if (!trimmedValue) {
        return ""
    }

    if (trimmedValue === ">") {
        return ">"
    }

    if (trimmedValue.toLowerCase() === "ş") {
        return "Ş"
    }

    if (/^\d+$/.test(trimmedValue)) {
        const numericValue = parseInt(trimmedValue, 10)
        if (numericValue > 0 && numericValue < 81) {
            return numericValue.toString()
        }
    }

    return ""
}

const applyNormalizedBusPlanValue = (input, normalizedValue) => {
    if (normalizedValue === "Ş") {
        input.value = "Ş"
        input.className = "bus-plan-create-input captain"
    }
    else if (normalizedValue === ">") {
        input.value = ">"
        input.className = "bus-plan-create-input doors"
    }
    else if (normalizedValue) {
        input.value = normalizedValue
        input.className = "bus-plan-create-input taken"
    }
    else {
        input.value = ""
        input.className = "bus-plan-create-input"
    }
}

const isDuplicateBusPlanValue = (currentInput, normalizedValue) => {
    let hasDuplicate = false

    $(".bus-plan-create-input").each((_, element) => {
        if (element !== currentInput && normalizeBusPlanInputValue(element.value) === normalizedValue) {
            hasDuplicate = true
            return false
        }
    })

    return hasDuplicate
}

const attachBusPlanInputEvents = () => {
    const inputs = $(".bus-plan-create-input")

    inputs.each((_, element) => {
        const normalized = normalizeBusPlanInputValue(element.value)
        element.dataset.lastValidValue = normalized
        applyNormalizedBusPlanValue(element, normalized)
    })

    inputs.off("focus.busPlan").on("focus.busPlan", event => {
        const input = event.currentTarget
        const normalized = normalizeBusPlanInputValue(input.value)
        input.dataset.lastValidValue = normalized
    })

    // duplicate kontrolünü change eventine taşıdık
    inputs.off("change.busPlan").on("change.busPlan", event => {
        const input = event.currentTarget
        const normalized = normalizeBusPlanInputValue(input.value)
        const lastValidValue = input.dataset.lastValidValue || ""

        applyNormalizedBusPlanValue(input, normalized)

        if (normalized && normalized !== "Ş" && normalized !== ">" && isDuplicateBusPlanValue(input, normalized)) {
            applyNormalizedBusPlanValue(input, lastValidValue)
            return
        }

        input.dataset.lastValidValue = normalized
    })
}

const areAllBusPlanInputsEmpty = () => {
    const inputs = $(".bus-plan-create-input")

    if (!inputs.length) {
        return true
    }

    return inputs.toArray().every(input => {
        return !normalizeBusPlanInputValue(input.value)
    })
}

let editingBusPlanId = null

$(".add-bus-plan").on("click", async e => {
    editingBusPlanId = null
    await $.ajax({
        url: "/get-bus-plan-panel",
        type: "GET",
        data: {},
        success: function (response) {
            $(".bus-plan-panel").html(response)

            attachBusPlanInputEvents()

            $(".save-bus-plan").on("click", async e => {
                const title = $(".bus-plan-title").val()
                const description = $(".bus-plan-description").val()

                if (areAllBusPlanInputsEmpty() && (!title || !title.trim() || !description || !description.trim())) {
                    showError("Otobüs planı boşken isim ve açıklama alanları boş bırakılamaz.")
                    return
                }

                let maxPassenger = 0;
                let plan = []
                let planBinary = ""
                $(".bus-plan-create-input").each((i, e) => {
                    plan.push(e.value ? e.value : 0)
                    if (e.value && e.value !== "Ş" && e.value !== ">") {
                        planBinary = `${planBinary}${1}`
                        maxPassenger += 1;
                    }
                    else {
                        planBinary = `${planBinary}${0}`
                    }
                })

                const planJSON = JSON.stringify(plan)

                await $.ajax({
                    url: "/post-save-bus-plan",
                    type: "POST",
                    data: { title, description, plan: planJSON, planBinary, maxPassenger },
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

const BUS_FEATURE_SELECTOR = ".bus-feature"
const BUS_COMMISSION_RATE_SELECTOR = ".bus-custom-commission"

function setBusFeatureValues(bus = {}) {
    $(BUS_FEATURE_SELECTOR).each((_, el) => {
        const field = el.dataset.field
        if (!field) return
        const value = bus[field]
        if (value === undefined || value === null) {
            if (typeof el.defaultChecked === "boolean") {
                el.checked = el.defaultChecked
            }
            else {
                el.checked = false
            }
        }
        else {
            el.checked = Boolean(value)
        }
    })
    setBusCommissionRateInputValue(bus.customCommissionRate)
}

function resetBusFeatureDefaults(options = {}) {
    const { forceUnchecked = false } = options

    $(BUS_FEATURE_SELECTOR).each((_, el) => {
        if (forceUnchecked) {
            el.checked = false
            return
        }

        if (typeof el.defaultChecked === "boolean") {
            el.checked = el.defaultChecked
        }
        else {
            el.checked = false
        }
    })
    resetBusCommissionRateInput()
}

function collectBusFeatureValues() {
    const result = {}
    $(BUS_FEATURE_SELECTOR).each((_, el) => {
        const field = el.dataset.field
        if (!field) return
        result[field] = el.checked ? "true" : "false"
    })
    return result
}

function setBusCommissionRateInputValue(value) {
    if (value === undefined || value === null || value === "") {
        $(BUS_COMMISSION_RATE_SELECTOR).val("")
        return
    }

    $(BUS_COMMISSION_RATE_SELECTOR).val(String(value))
}

function resetBusCommissionRateInput() {
    $(BUS_COMMISSION_RATE_SELECTOR).val("")
}

function getBusCommissionRateInputValue() {
    const value = $(BUS_COMMISSION_RATE_SELECTOR).val()
    if (typeof value === "string") {
        return value.trim()
    }
    return value
}

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

            $(".bus-delete").on("click", async function (e) {
                e.preventDefault()
                e.stopPropagation()

                const $button = $(this)
                const plate = $button.data("plate")
                window.alert("Bu otobüsü silerseniz bunu kullanan seferler de etkilenecektir.")
                const message = `${plate || "Bu otobüsü"} silmek istediğinize emin misiniz?`
                if (message && !window.confirm(message)) {
                    return
                }

                try {
                    const data = { id: $button.data("id") }
                    await $.ajax({ url: "/post-delete-bus", type: "POST", data })
                    const id = String($button.data("id"))
                    if (String(editingBusId) === id) {
                        editingBusId = null
                        $(".bus-license-plate").val("")
                        $(".bus-bus-model").val("")
                        $(".bus-captain").val("")
                        $(".bus-phone").val("")
                        $(".bus-owner").val("")
                        $(".bus").css("width", "")
                        $(".bus-list").addClass("col-12").removeClass("col-4")
                        $(".bus-info").css("display", "none")
                        $(".bus-settings").css("display", "none")
                        $(".save-bus").html("KAYDET")
                    }
                    $button.closest(".btn-group").remove()
                } catch (err) {
                    showError(getAjaxErrorMessage(err))
                }
            })

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
                        setBusFeatureValues(response || {})
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
    resetBusFeatureDefaults({ forceUnchecked: true })
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
    const featureData = collectBusFeatureValues()
    const customCommissionRate = getBusCommissionRateInputValue()

    const trimmedLicensePlate = typeof licensePlate === "string" ? licensePlate.trim() : ""
    const trimmedPhoneNumber = typeof phoneNumber === "string" ? phoneNumber.trim() : ""
    const normalizedBusModelId = typeof busModelId === "string" ? busModelId.trim() : busModelId

    if (!trimmedLicensePlate || !normalizedBusModelId || !trimmedPhoneNumber) {
        showError("Lütfen plaka, otobüs modeli ve araç telefonu bilgilerini doldurunuz.")
        return
    }

    await $.ajax({
        url: "/post-save-bus",
        type: "POST",
        data: { id: editingBusId, licensePlate: trimmedLicensePlate, busModelId: normalizedBusModelId, captainId, phoneNumber: trimmedPhoneNumber, owner, customCommissionRate, ...featureData },
        success: function (response) {
            $(".bus-license-plate").val("")
            $(".bus-bus-model").val("")
            $(".bus-captain").val("")
            $(".bus-phone").val("")
            $(".bus-owner").val("")
            resetBusFeatureDefaults()
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

            $(".staff-delete").on("click", async function (e) {
                e.preventDefault()
                e.stopPropagation()

                const $button = $(this)
                const name = $button.data("name")
                window.alert("Bu personeli silerseniz bu personeli kullanan otobüs ve seferler de etkilenecektir.")
                const message = `${name || "Bu personeli"} silmek istediğinize emin misiniz?`
                if (message && !window.confirm(message)) {
                    return
                }

                try {
                    const data = { id: $button.data("id") }
                    await $.ajax({ url: "/post-delete-staff", type: "POST", data })
                    const id = String($button.data("id"))
                    if (String(editingStaffId) === id) {
                        editingStaffId = null
                        $(".staff-id-number").val("")
                        $(".staff-duty").val("")
                        $(".staff-name").val("")
                        $(".staff-surname").val("")
                        $(".staff-address").val("")
                        $(".staff-phone").val("")
                        $("input[name='staff-gender']").prop("checked", false)
                        $(".staff-nationality").val("")
                        $(".staff-panel").css("display", "none")
                        $(".save-staff").html("KAYDET")
                    }
                    $button.closest(".btn-group").remove()
                } catch (err) {
                    showError(getAjaxErrorMessage(err))
                }
            })

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
    const idNumber = ($(".staff-id-number").val() || "").trim()
    const duty = $(".staff-duty").val()
    const name = ($(".staff-name").val() || "").trim()
    const surname = ($(".staff-surname").val() || "").trim()
    const address = $(".staff-address").val()
    const phoneNumber = ($(".staff-phone").val() || "").trim()
    const gender = $("input[name='staff-gender']:checked").val()
    const nationality = $(".staff-nationality").val()

    if (!idNumber) {
        showError("Lütfen kimlik numarası giriniz.")
        return
    }

    if (!duty) {
        showError("Lütfen görev seçiniz.")
        return
    }

    if (!name) {
        showError("Lütfen isim giriniz.")
        return
    }

    if (!surname) {
        showError("Lütfen soyisim giriniz.")
        return
    }

    if (!phoneNumber) {
        showError("Lütfen telefon numarası giriniz.")
        return
    }

    if (!gender) {
        showError("Lütfen cinsiyet seçiniz.")
        return
    }

    if (!nationality) {
        showError("Lütfen uyruk seçiniz.")
        return
    }

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

            $(".stop-delete").on("click", async function (e) {
                e.preventDefault()
                e.stopPropagation()

                const $button = $(this)
                const warningMessage = "Bu durağı silerseniz bu durağı kullanan hatlar, şubeler, bu şubelerin kullanıcıları ve seferler de silinecektir."
                if (!window.confirm(warningMessage)) {
                    return
                }

                try {
                    const data = { id: $button.data("id") }
                    await $.ajax({ url: "/post-delete-stop", type: "POST", data })
                    const id = String($button.data("id"))
                    if (String(editingStopId) === id) {
                        editingStopId = null
                        $(".stop-title").val("")
                        $(".stop-web-title").val("")
                        $(".stop-place").val("")
                        $(".stop-uetds").val("")
                        $(".stop-service").prop("checked", false)
                        $(".stop-active").prop("checked", true)
                        $(".stop-panel").css("display", "none")
                        $(".save-stop").html("KAYDET")
                    }
                    $button.closest(".btn-group").remove()
                } catch (err) {
                    showError(getAjaxErrorMessage(err))
                }
            })

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
    const title = ($(".stop-title").val() || "").trim()
    let webTitle = ($(".stop-web-title").val() || "").trim()
    const placeId = ($(".stop-place").val() || "").trim()
    const UETDS_code = ($(".stop-uetds").val() || "").trim()
    const isServiceArea = $(".stop-service").is(":checked")
    const isActive = $(".stop-active").is(":checked")

    if (!title || !placeId || !UETDS_code) {
        showError("Durak adı, yer ve UETDS kodu boş bırakılamaz.")
        return
    }

    if (!webTitle) {
        webTitle = title
        $(".stop-web-title").val(webTitle)
    }

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
const syncRouteStopsState = () => {
    routeStops = $(".route-stop")
        .map((_, el) => {
            const $el = $(el);
            const $durationInput = $el.find(".duration-input");
            const rawValue =
                $durationInput.length > 0
                    ? $durationInput.val()
                    : $el.attr("data-duration");
            const durationValue =
                $durationInput.length > 0
                    ? (rawValue || "").trim()
                    : (rawValue || "").trim() || "00:00";
            $el.attr("data-duration", durationValue);
            return {
                stopId: $el.data("stopId"),
                duration: durationValue
            };
        })
        .get();
};

$(document).on("change", ".route-stops .duration-input", syncRouteStopsState);

const ROUTE_ACTIVE_TAB_CLASS = "active";
const ROUTE_TAB_DEFAULT_ID = "route-stops-tab";
const ROUTE_TIME_PICKER_OPTIONS = {
    enableTime: true,
    noCalendar: true,
    dateFormat: "H:i",
    time_24hr: true,
    allowInput: true,
};

const formatRouteTimeValue = value => {
    if (!value) return "";
    const stringValue = String(value);
    const match = stringValue.match(/^(\d{1,2}):(\d{2})/);
    if (!match) {
        return stringValue;
    }
    const [, hours, minutes] = match;
    return `${hours.padStart(2, "0")}:${minutes}`;
};

const setRouteActiveTab = targetId => {
    if (!targetId) return;
    const tabs = document.querySelectorAll(".route-tab");
    tabs.forEach(tab => {
        const isActive = tab.dataset.target === targetId;
        tab.classList.toggle(ROUTE_ACTIVE_TAB_CLASS, isActive);
        if (isActive) {
            tab.classList.add("btn-primary");
            tab.classList.remove("btn-outline-primary");
        } else {
            tab.classList.remove("btn-primary");
            tab.classList.add("btn-outline-primary");
        }
    });

    const panels = document.querySelectorAll(".route-tab-panel");
    panels.forEach(panel => {
        panel.classList.toggle(ROUTE_ACTIVE_TAB_CLASS, panel.id === targetId);
    });
};

const initializeRouteTimePickers = () => {
    if (typeof flatpickr !== "function") {
        return;
    }
    const inputs = document.querySelectorAll(".route-settings .time-flatpickr");
    inputs.forEach(input => {
        if (!input) return;
        const currentValue = input.value;
        if (input._flatpickr) {
            input._flatpickr.destroy();
        }
        const instance = flatpickr(input, ROUTE_TIME_PICKER_OPTIONS);
        if (currentValue) {
            instance.setDate(currentValue, false, "H:i");
        }
    });
};

$(document).on("click", ".route-tab", e => {
    const targetId = e.currentTarget?.dataset?.target;
    if (!targetId) return;
    setRouteActiveTab(targetId);
});

$(function () {
    const initialTab = document.querySelector(".route-tab.active")?.dataset?.target || ROUTE_TAB_DEFAULT_ID;
    setRouteActiveTab(initialTab);
    initializeRouteTimePickers();
});

$(".route-nav").on("click", async e => {
    routeStops = []
    await $.ajax({
        url: "/get-routes-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".route-list-nodes").html(response)

            $(".route").css("width", "40vw")
            $(".route-list").removeClass("col-4").addClass("col-12")
            $(".route-info").css("display", "none")
            $(".route-settings").css("display", "none")

            $.ajax({
                url: "/get-stops-data",
                type: "GET",
                success: function (stops) {
                    const opts = ['<option value="" selected></option>']
                    for (const s of stops) {
                        opts.push(`<option value="${s.id}">${s.title}</option>`)
                    }
                    $(".route-stop-place").html(opts.join(""))
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
                        $(".route-description").val(response.description)
                        $(".route-reservation-option-time").val(formatRouteTimeValue(response.reservationOptionTime))
                        $(".route-transfer-option-time").val(formatRouteTimeValue(response.refundTransferOptionTime))
                        $(".route-max-reservation-count").val(
                            response.maxReservationCount !== undefined && response.maxReservationCount !== null
                                ? response.maxReservationCount
                                : ""
                        )
                        $(".route-max-single-seat-count").val(
                            response.maxSingleSeatCount !== undefined && response.maxSingleSeatCount !== null
                                ? response.maxSingleSeatCount
                                : ""
                        )
                        initializeRouteTimePickers()
                        setRouteActiveTab(ROUTE_TAB_DEFAULT_ID)

                        await $.ajax({
                            url: "/get-route-stops-list",
                            type: "GET",
                            data: { id },
                            success: function (response) {
                                $(".route-stops").html(response)
                                syncRouteStopsState();

                                $(".route").css("width", "80vw")
                                $(".route-list").removeClass("col-12").addClass("col-4")
                                $(".route-info").css("display", "flex")
                                $(".route-settings").css("display", "block")
                                $(".save-route").html("KAYDET")
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
    $(".route-description").val("")
    $(".route-reservation-option-time").val("")
    $(".route-transfer-option-time").val("")
    $(".route-max-reservation-count").val("")
    $(".route-max-single-seat-count").val("")
    $(".route-stops").html("")
    $(".route-stop-duration").css("display", "none")
    routeStops = []
    editingRouteId = null
    $(".route").css("width", "80vw")
    $(".route-list").removeClass("col-12").addClass("col-4")
    $(".route-info").css("display", "flex")
    $(".route-settings").css("display", "block")
    $(".save-route").html("EKLE")
    setRouteActiveTab(ROUTE_TAB_DEFAULT_ID)
    initializeRouteTimePickers()
})

const timeInput = document.querySelector(".route-stop-duration");

// Yazarken 2 haneden sonra ":" ekle
timeInput.addEventListener("input", () => {
    let val = timeInput.value.replace(/[^0-9]/g, ""); // sadece rakam

    if (val.length > 2) {
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
    const isFirst = routeStops.length === 0

    if (stopId)
        await $.ajax({
            url: "/get-route-stop",
            type: "GET",
            data: { stopId, duration, isFirst },
            success: function (response) {
                $(".route-stop-duration").css("display", "block")
                $(".route-stop-place").val("")
                $(".route-stop-duration").val("")
                $(".route-stops").append(response)
                syncRouteStopsState();

                $(".remove-route-stop").off().on("click", e => {
                    const $stop = $(e.currentTarget).closest(".route-stop");
                    if (!$stop.length) return;

                    const stopId = $stop.data("stopId");
                    const wasFirst = $stop.is(":first-child");
                    $stop.remove();
                    routeStops = routeStops.filter(rs => String(rs.stopId) !== String(stopId));

                    if (wasFirst) {
                        const $newFirst = $(".route-stop").first();
                        if ($newFirst.length) {
                            $newFirst.find("._route-stop-duration").remove();
                            $newFirst.attr("data-duration", "00:00");
                        }
                    }

                    syncRouteStopsState();
                });

                const timeInput = document.querySelector(".route-stops .route-stop:last-of-type .duration-input");

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
                        syncRouteStopsState();
                    });
                }
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        })
})

$(".save-route").on("click", async e => {
    const routeCode = ($(".route-code").val() || "").trim()
    const routeTitle = ($(".route-title").val() || "").trim()
    const routeDescription = ($(".route-description").val() || "").trim()
    const reservationOptionTime = $(".route-reservation-option-time").val()?.trim() || ""
    const refundTransferOptionTime = $(".route-transfer-option-time").val()?.trim() || ""
    const maxReservationCount = $(".route-max-reservation-count").val()?.trim() || ""
    const maxSingleSeatCount = $(".route-max-single-seat-count").val()?.trim() || ""

    $(".route-code").val(routeCode)
    $(".route-title").val(routeTitle)
    $(".route-description").val(routeDescription)

    syncRouteStopsState()

    if (!routeCode || !routeTitle || !routeDescription) {
        showError("Hat kodu, hat adı ve açıklama alanları boş bırakılamaz.")
        return
    }

    if (!routeStops.length) {
        showError("Lütfen hat için en az bir durak ekleyin.")
        return
    }

    const routeStopsSTR = JSON.stringify(routeStops)

    await $.ajax({
        url: "/post-save-route",
        type: "POST",
        data: {
            id: editingRouteId,
            routeCode,
            routeDescription,
            routeTitle,
            reservationOptionTime,
            refundTransferOptionTime,
            maxReservationCount,
            maxSingleSeatCount,
            routeStopsSTR
        },
        success: function (response) {
            editingRouteId = null
            $(".route-code").val("")
            $(".route-title").val("")
            $(".route-description").val("")
            $(".route-reservation-option-time").val("")
            $(".route-transfer-option-time").val("")
            $(".route-max-reservation-count").val("")
            $(".route-max-single-seat-count").val("")
            routeStops = []
            $(".blackout").css("display", "none")
            $(".route").css("display", "none")
            $(".route-info").css("display", "none")
            $(".route-settings").css("display", "none")
            setRouteActiveTab(ROUTE_TAB_DEFAULT_ID)
            initializeRouteTimePickers()
        },
        error: function (xhr) {
            showError(getAjaxErrorMessage(xhr))
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

const toNullIfNotPositive = val => {
    const num = Number(val);
    return Number.isFinite(num) && num > 0 ? num : null;
};

const collectPriceRowData = (row, { includeId = true, appendTimeSuffix = false } = {}) => {
    const result = {};

    if (includeId) {
        const id = row.data("id");
        if (id !== undefined) {
            result.id = id;
        }
    }

    row.find("select.price-button-select").each(function () {
        const select = $(this);
        const field = select.data("field");
        if (!field) return;
        const value = select.val();
        if (value === undefined || value === null || value === "") {
            result[field] = null;
            return;
        }
        const num = Number(value);
        result[field] = Number.isFinite(num) ? num : value;
    });

    const bidirectionalInput = row.find(".price-bidirectional");
    if (bidirectionalInput.length) {
        const field = bidirectionalInput.data("field") || "isBidirectional";
        result[field] = bidirectionalInput.is(":checked");
    }

    const priceFields = new Set([
        "price1",
        "price2",
        "price3",
        "webPrice",
        "singleSeatPrice1",
        "singleSeatPrice2",
        "singleSeatPrice3",
        "singleSeatWebPrice"
    ]);

    row.find("input.price-button-input").each(function () {
        const input = $(this);
        const field = input.data("field");
        if (!field) return;
        let value = input.val();
        if (typeof value === "string") {
            value = value.trim();
        }

        if (priceFields.has(field)) {
            result[field] = toNullIfNotPositive(value);
            return;
        }

        if (field === "seatLimit") {
            if (value === "" || value === null || value === undefined) {
                result[field] = null;
            } else {
                const num = Number(value);
                result[field] = Number.isFinite(num) ? num : null;
            }
            return;
        }

        if (field === "hourLimit") {
            if (value === "" || value === null || value === undefined) {
                result[field] = null;
            } else {
                const num = Number(value);
                result[field] = Number.isFinite(num) ? num : null;
            }
            return;
        }

        if (field === "validFrom" || field === "validUntil") {
            if (!value) {
                result[field] = null;
            } else {
                result[field] = appendTimeSuffix ? `${value}T00:00` : value;
            }
            return;
        }

        result[field] = value ?? null;
    });

    return result;
};

const resetPriceAddRow = () => {
    const row = $(".price-add-row");
    const selects = row.find("select.price-button-select");
    selects.each(function () {
        const select = $(this);
        const field = select.data("field");
        let options = '<option value="">Seçiniz</option>';
        priceStops.forEach(pl => {
            options += `<option value="${pl.id}">${pl.title}</option>`;
        });
        select.html(options);
        select.val("");
    });
    row.find("input.price-button-input").each(function () {
        const input = $(this);
        input.val("");
    });
    row.find(".price-bidirectional").prop("checked", false);
    row.find(".date-picker").each(function () {
        if (this._flatpickr) {
            this._flatpickr.clear();
        }
    });
    flatpickr(row.find(".date-picker").toArray(), {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d F Y",
    });
};

$(".price-nav").on("click", async e => {
    await $.ajax({
        url: "/get-prices-list",
        type: "GET",
        success: function (response) {
            $(".price-list-nodes").html(response);
            const stopsData = $("#price-stops-data").text();
            priceStops = stopsData ? JSON.parse(stopsData) : [];

            $(".price-delete").on("click", async function (e) {
                e.preventDefault()
                e.stopPropagation()

                const $button = $(this)
                const from = $button.data("from")
                const to = $button.data("to")
                const message = from && to
                    ? `${from} - ${to} fiyatını silmek istediğinize emin misiniz?`
                    : "Bu fiyatı silmek istediğinize emin misiniz?"
                if (message && !window.confirm(message)) {
                    return
                }

                try {
                    const data = { id: $button.data("id") }
                    await $.ajax({ url: "/post-delete-price", type: "POST", data })
                    $button.closest(".btn-group").remove()
                } catch (err) {
                    showError(getAjaxErrorMessage(err))
                }
            })

            $(".price-row, .price-add-row").off().on("click", function () {
                const row = $(this);
                if (row.hasClass("price-button-inputs")) return;
                row.removeClass("btn-outline-primary").addClass("btn-primary price-button-inputs");
                row.children(".col").each(function () {
                    const column = $(this);
                    const paragraph = column.find("p");
                    if (!paragraph.length) return;

                    const field = paragraph.data("field");
                    const valueAttr = paragraph.data("value");
                    const displayValue = valueAttr !== undefined ? valueAttr : paragraph.text().trim();

                    if (field === "fromStopId" || field === "toStopId") {
                        const select = $("<select>", {
                            class: "price-button-select",
                            "data-field": field
                        });
                        select.append('<option value="">Seçiniz</option>');
                        priceStops.forEach(pl => {
                            const option = $("<option>", {
                                value: pl.id,
                                text: pl.title
                            });
                            select.append(option);
                        });
                        if (displayValue !== undefined && displayValue !== null && displayValue !== "") {
                            select.val(String(displayValue));
                        }
                        paragraph.replaceWith(select);
                    } else if (field === "isBidirectional") {
                        const checkbox = $("<input>", {
                            type: "checkbox",
                            class: "form-check-input price-bidirectional",
                            "data-field": field
                        });
                        const isChecked = displayValue === true || displayValue === "true" || displayValue === 1 || displayValue === "1";
                        checkbox.prop("checked", isChecked);
                        paragraph.replaceWith(checkbox);
                        column.addClass("d-flex justify-content-center align-items-center");
                    } else {
                        const classes = ["price-button-input"];
                        let type = "text";
                        if (field === "seatLimit" || field === "hourLimit") {
                            type = "number";
                        }
                        if (field === "hourLimit") {
                            classes.push("hour-limit");
                        }
                        if (field === "validFrom" || field === "validUntil") {
                            classes.push("date-picker");
                        }
                        const input = $("<input>", {
                            type,
                            value: displayValue ?? "",
                            "data-field": field
                        });
                        input.addClass(classes.join(" "));
                        paragraph.replaceWith(input);
                    }
                });
                flatpickr(row.find(".date-picker").toArray(), {
                    dateFormat: "Y-m-d",
                    altInput: true,
                    altFormat: "d F Y",
                });
            });

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

$(".price-save").on("click", async function () {
    const data = [];
    $(".price-list-nodes .price-button-inputs").each(function () {
        const entry = collectPriceRowData($(this), { appendTimeSuffix: true });
        if (entry && Object.prototype.hasOwnProperty.call(entry, "id")) {
            data.push(entry);
        }
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

    const data = collectPriceRowData(row, { includeId: false, appendTimeSuffix: false });

    if (!data.fromStopId) {
        showError("Lütfen Nereden bilgisini seçiniz.");
        return;
    }

    if (!data.toStopId) {
        showError("Lütfen Nereye bilgisini seçiniz.");
        return;
    }

    if (data.price1 == null) {
        showError("Lütfen Fiyat1 bilgisini giriniz.");
        return;
    }

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

    if (!routeId) {
        showError("Lütfen hat seçiniz.")
        return
    }

    if (!firstDate) {
        showError("Lütfen ilk tarihi seçiniz.")
        return
    }

    if (!lastDate) {
        showError("Lütfen son tarihi seçiniz.")
        return
    }

    if (!departureTime) {
        showError("Lütfen kalkış saatini giriniz.")
        return
    }

    if (!busModelId) {
        showError("Lütfen otobüs planını seçiniz.")
        return
    }

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

$(document)
    .off("click.branchDelete")
    .on("click.branchDelete", ".branch-delete", async function (e) {
        e.preventDefault()
        e.stopPropagation()

        const $button = $(this)
        const message = "Bu şubeyi silerseniz bu şubeye bağlı kullanıcılar da silinecektir."
        if (message && !window.confirm(message)) {
            return
        }

        try {
            const data = { id: $button.data("id") }
            await $.ajax({ url: "/post-delete-branch", type: "POST", data })
            const id = String($button.data("id"))
            if (String(editingBranchId) === id) {
                editingBranchId = null
                $("#isBranchActive").prop("checked", true)
                $("#isMainBranch").prop("checked", false)
                $(".branch-title").val("")
                $(".branch-place").val("")
                $(".branch-main-branch").val("")
                $(
                    ".branch-owner, .branch-phone, .branch-address, .branch-trade-title, .branch-tax-office, .branch-tax-number, .branch-f1-document, .branch-own-commission, .branch-other-commission, .branch-internet-commission, .branch-deduction1, .branch-deduction2, .branch-deduction3, .branch-deduction4, .branch-deduction5"
                ).val("")
                $(".branch-info").css("display", "none")
                $(".branch-settings").css("display", "none")
                $(".branch").css("width", "")
                $(".branch-list").addClass("col-12").removeClass("col-4")
            }
            $button.closest(".btn-group").remove()
        } catch (err) {
            showError(getAjaxErrorMessage(err))
        }
    })

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
            $(".branch").css("width", "30vw")
            $(".branch-list").addClass("col-12").removeClass("col-4")
            $(".branch-info").css("display", "none")
            $(".branch-settings").css("display", "none")

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
                        $(".branch").css("width", "90vw")
                        $(".branch-list").removeClass("col-12").addClass("col-4")
                        $(".save-branch").html("KAYDET")
                        $(".branch-info").css("display", "flex")
                        $(".branch-settings").css("display", "block")
                        $(".branch-title").val(response.title)
                        $(".branch-place").val(response.stopId)
                        $(".branch-main-branch").val(response.mainBranchId)
                        const setBranchField = (selector, value) => {
                            const val = value ?? "";
                            $(selector).val(val);
                        };
                        setBranchField(".branch-owner", response.ownerName)
                        setBranchField(".branch-phone", response.phoneNumber)
                        setBranchField(".branch-address", response.address)
                        setBranchField(".branch-trade-title", response.tradeTitle)
                        setBranchField(".branch-tax-office", response.taxOffice)
                        setBranchField(".branch-tax-number", response.taxNumber)
                        setBranchField(".branch-f1-document", response.f1DocumentCode)
                        setBranchField(".branch-own-commission", response.ownStopSalesCommission)
                        setBranchField(".branch-other-commission", response.otherStopSalesCommission)
                        setBranchField(".branch-internet-commission", response.internetTicketCommission)
                        setBranchField(".branch-deduction1", response.defaultDeduction1)
                        setBranchField(".branch-deduction2", response.defaultDeduction2)
                        setBranchField(".branch-deduction3", response.defaultDeduction3)
                        setBranchField(".branch-deduction4", response.defaultDeduction4)
                        setBranchField(".branch-deduction5", response.defaultDeduction5)

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
    $(".branch-owner, .branch-phone, .branch-address, .branch-trade-title, .branch-tax-office, .branch-tax-number, .branch-f1-document, .branch-own-commission, .branch-other-commission, .branch-internet-commission, .branch-deduction1, .branch-deduction2, .branch-deduction3, .branch-deduction4, .branch-deduction5").val("")
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
    const ownerName = $(".branch-owner").val()
    const phoneNumber = $(".branch-phone").val()
    const address = $(".branch-address").val()
    const tradeTitle = $(".branch-trade-title").val()
    const taxOffice = $(".branch-tax-office").val()
    const taxNumber = $(".branch-tax-number").val()
    const f1DocumentCode = $(".branch-f1-document").val()
    const ownStopSalesCommission = $(".branch-own-commission").val()
    const otherStopSalesCommission = $(".branch-other-commission").val()
    const internetTicketCommission = $(".branch-internet-commission").val()
    const defaultDeduction1 = $(".branch-deduction1").val()
    const defaultDeduction2 = $(".branch-deduction2").val()
    const defaultDeduction3 = $(".branch-deduction3").val()
    const defaultDeduction4 = $(".branch-deduction4").val()
    const defaultDeduction5 = $(".branch-deduction5").val()

    if (!title || !String(title).trim()) {
        showError("Şube adı zorunludur.")
        return
    }

    if (!stop) {
        showError("Bulunduğu durak seçilmelidir.")
        return
    }

    if (!isMainBranch && (!mainBranch || !String(mainBranch).trim())) {
        showError("Ana şube seçilmelidir.")
        return
    }

    await $.ajax({
        url: "/post-save-branch",
        type: "POST",
        data: {
            id: editingBranchId,
            isActive,
            isMainBranch,
            title,
            stop,
            mainBranch,
            ownerName,
            phoneNumber,
            address,
            tradeTitle,
            taxOffice,
            taxNumber,
            f1DocumentCode,
            ownStopSalesCommission,
            otherStopSalesCommission,
            internetTicketCommission,
            defaultDeduction1,
            defaultDeduction2,
            defaultDeduction3,
            defaultDeduction4,
            defaultDeduction5,
        },
        success: function (response) {
            editingBranchId = null
            $("#isBranchActive").prop('checked', false)
            $("#isMainBranch").prop('checked', false)
            $(".branch-title").val("")
            $(".branch-place").val("")
            $(".branch-main-branch").val("")
            $(".branch-owner, .branch-phone, .branch-address, .branch-trade-title, .branch-tax-office, .branch-tax-number, .branch-f1-document, .branch-own-commission, .branch-other-commission, .branch-internet-commission, .branch-deduction1, .branch-deduction2, .branch-deduction3, .branch-deduction4, .branch-deduction5").val("")
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

const permissionModules = ['register', 'trip', 'sales', 'account_cut', 'other'];

function updateSelectAllCheckbox(module) {
    const container = $(`.permission-list[data-module="${module}"]`);
    const selectAll = $(`.permission-select-all[data-module="${module}"]`);
    const checkboxes = container.find('.permission-checkbox');

    if (!selectAll.length) {
        return;
    }

    if (!checkboxes.length) {
        selectAll.prop('checked', false);
        selectAll.prop('indeterminate', false);
        return;
    }

    const total = checkboxes.length;
    const checkedCount = checkboxes.filter(':checked').length;

    selectAll.prop('checked', checkedCount === total);
    selectAll.prop('indeterminate', checkedCount > 0 && checkedCount < total);
}

function renderPermissions(perms) {
    permissionModules.forEach(m => {
        const container = $(`.permission-list[data-module="${m}"]`);
        container.html('');
        if (perms[m]) {
            perms[m].forEach(p => {
                const id = `perm-${p.id}`;
                container.append(`<div class="form-check"><input class="form-check-input permission-checkbox" type="checkbox" value="${p.id}" id="${id}" ${p.allow ? 'checked' : ''}><label class="form-check-label" for="${id}">${p.description}</label></div>`);
            });
        }
        updateSelectAllCheckbox(m);
    });
    updatePermissionInputsAccess();
}

$(document).on('change', '.permission-select-all', function () {
    const module = $(this).data('module');
    const checked = $(this).is(':checked');
    $(this).prop('indeterminate', false);
    $(`.permission-list[data-module="${module}"] .permission-checkbox`).prop('checked', checked);
    updateSelectAllCheckbox(module);
});

$(document).on('change', '.permission-checkbox', function () {
    const module = $(this).closest('.permission-list').data('module');
    updateSelectAllCheckbox(module);
});

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

            $(".users").css("width", "40vw")
            $(".user-list").removeClass("col-4").addClass("col-12")
            $(".user-info").css("display", "none")
            $(".user-settings").css("display", "none")

            $(".user-delete").on("click", async function (e) {
                e.preventDefault()
                e.stopPropagation()

                const $button = $(this)
                if (!window.confirm("Bu kullanıcıyı silmek istediğinize emin misiniz?.")) {
                    return
                }

                try {
                    const data = { id: $button.data("id") }
                    await $.ajax({ url: "/post-delete-user", type: "POST", data })
                    const id = String($button.data("id"))
                    if (String(editingUserId) === id) {
                        editingUserId = null
                        $("#isUserActive").prop("checked", true)
                        $(".user-name").val("")
                        $(".user-username").val("")
                        $(".user-password").val("")
                        $(".user-phone").val("")
                        $(".user-branches").val("")
                        $(".users").css("width", "")
                        $(".user-list").addClass("col-12").removeClass("col-4")
                        $(".user-info").css("display", "none")
                        $(".user-settings").css("display", "none")
                        $(".save-user").html("KAYDET")
                        renderPermissions({ register: [], trip: [], sales: [], account_cut: [] })
                    }
                    $button.closest(".btn-group").remove()
                } catch (err) {
                    showError(getAjaxErrorMessage(err))
                }
            })

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

const openCustomerInfoPopup = (row, origin) => {
    const popup = $(".member-info");
    const id = row.data("id") || null;
    const idNumber = row.data("idnumber") || "";
    const name = row.data("name") || "";
    const surname = row.data("surname") || "";
    const phone = row.data("phone") || "";
    const gender = row.data("gender") || "";
    const type = row.data("customertype") || "";
    const category = row.data("customercategory") || "";
    const pointOrPercent = row.data("pointorpercent") || "";
    const pointAmount = row.data("pointamount");
    const percent = row.data("percent");

    popup.data("customerId", id);
    popup.data("origin", origin);
    popup.data("sourceRow", row.get(0));

    $(".member-info-idNumber").val(idNumber);
    $(".member-info-name").val(name);
    $(".member-info-surname").val(surname);
    $(".member-info-phone").val(phone);
    $(".member-info-gender").val(gender);
    $(".member-info-type").val(type);
    $(".member-info-category").val(category);
    $(".member-info-pointorpercent").val(pointOrPercent);
    const pointAmountValue = pointAmount === undefined || pointAmount === null ? "" : pointAmount;
    const percentValue = percent === undefined || percent === null ? "" : percent;
    $(".member-info-pointamount").val(pointAmountValue);
    $(".member-info-percent").val(percentValue);
    updateMemberPointOrPercentAvailability();

    const saveBtn = $(".member-info-save");
    if (!saveBtn.data("defaultText")) {
        saveBtn.data("defaultText", saveBtn.text());
    }
    if (id) {
        saveBtn.prop("disabled", false).text(saveBtn.data("defaultText"));
    } else {
        saveBtn.prop("disabled", true).text(saveBtn.data("defaultText"));
    }

    $(".members").css("display", "none");
    $(".customers").css("display", "none");
    popup.css("display", "block");
    $(".blackout").css("display", "block");

    $(".member-ticket-list").html("");
    if (idNumber) {
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
    }
};

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

            $(".customer-row").on("click", function () {
                const row = $(this);
                const origin = row.hasClass("member-row") ? "members" : "customers";
                openCustomerInfoPopup(row, origin);
            });
            $(".member-info-pointorpercent").on("change", updateMemberPointInputsState);
            $(".member-info-category").on("change", updateMemberPointOrPercentAvailability);
            $(".member-ticket-go-trip").on("click", async function (e) {
                e.preventDefault();

                const $btn = $(this);
                clearMemberTicketFeedback($btn);
                const tripId = $btn.data("tripId");
                const tripDate = $btn.data("tripDate");
                const tripTime = $btn.data("tripTime");

                if (!tripId || !tripDate || !tripTime) {
                    showMemberTicketFeedback($btn, "Bu bilet için aktif bir sefer bulunamadı.");
                    return;
                }

                const previousTripState = {
                    id: currentTripId,
                    date: currentTripDate,
                    time: currentTripTime
                };

                $btn.prop("disabled", true);

                try {
                    await loadTrip(tripDate, tripTime, tripId);

                    currentTripId = tripId;
                    currentTripDate = tripDate;
                    currentTripTime = tripTime;

                    $(".member-info").css("display", "none");
                    $(".blackout").css("display", "none");
                } catch (error) {
                    currentTripId = previousTripState.id;
                    currentTripDate = previousTripState.date;
                    currentTripTime = previousTripState.time;

                    const status = error?.status || error?.statusCode || error?.responseJSON?.status;
                    const errorCode = error?.responseJSON?.code || error?.responseJSON?.errorCode;
                    const notFound = status === 404 || errorCode === "TRIP_NOT_FOUND";

                    if (notFound) {
                        const fallbackMessage = "Bu bilet için aktif bir sefer bulunamadı.";
                        const message = error?.responseJSON?.message || fallbackMessage;
                        console.warn("Trip not found for ticket", { tripId, tripDate, tripTime, error });
                        showMemberTicketFeedback($btn, message);
                    } else {
                        console.error(error);
                        showError("Sefer bilgisi yüklenemedi.");
                    }
                } finally {
                    $btn.prop("disabled", false);
                }
            });
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
    const message = $(".announcement-message").val()?.trim()
    const branchId = $(".announcement-branch").val()
    const showTicker = $(".announcement-show-ticker").is(":checked")
    const showPopup = $(".announcement-show-popup").is(":checked")

    if (!message) {
        showError("Lütfen bir mesaj girin.")
        return
    }

    if (!branchId) {
        showError("Lütfen bir şube seçin.")
        return
    }

    if (!showTicker && !showPopup) {
        showError("En az bir gösterim seçilmelidir.")
        return
    }
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

$(".customer-blacklist-open").off().on("click", function (e) {
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

function updateMemberPointInputsState() {
    const mode = $(".member-info-pointorpercent").val();
    const pointInput = $(".member-info-pointamount");
    const percentInput = $(".member-info-percent");

    if (mode === "point") {
        pointInput.prop("disabled", false);
        percentInput.prop("disabled", true);
    } else if (mode === "percent") {
        pointInput.prop("disabled", true);
        percentInput.prop("disabled", false);
    } else {
        pointInput.prop("disabled", true);
        percentInput.prop("disabled", true);
    }
}

function updateMemberPointOrPercentAvailability() {
    const category = $(".member-info-category").val();
    const pointOrPercentSelect = $(".member-info-pointorpercent");
    const isSubscriber = category === "member";

    pointOrPercentSelect.prop("disabled", !isSubscriber);

    if (!isSubscriber) {
        pointOrPercentSelect.val("");
    }

    updateMemberPointInputsState();
}

$(".member-nav").on("click", async e => {
    await $.ajax({
        url: "/get-members-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".member-list-nodes").html(response)
            $(".member-search-idNumber").val("")
            $(".member-search-name").val("")
            $(".member-search-surname").val("")
            $(".member-search-phone").val("")
            $(".blackout").css("display", "block")
            $(".members").css("display", "block")

            $(".member-row").on("click", function () {
                const row = $(this);
                const origin = row.hasClass("member-row") ? "members" : "customers";
                openCustomerInfoPopup(row, origin);
            });

            $(".member-info-pointorpercent").on("change", updateMemberPointInputsState);
            $(".member-info-category").on("change", updateMemberPointOrPercentAvailability);
            $(".member-ticket-go-trip").on("click", async function (e) {
                e.preventDefault();

                const $btn = $(this);
                clearMemberTicketFeedback($btn);
                const tripId = $btn.data("tripId");
                const tripDate = $btn.data("tripDate");
                const tripTime = $btn.data("tripTime");

                if (!tripId || !tripDate || !tripTime) {
                    showMemberTicketFeedback($btn, "Bu bilet için aktif bir sefer bulunamadı.");
                    return;
                }

                const previousTripState = {
                    id: currentTripId,
                    date: currentTripDate,
                    time: currentTripTime
                };

                $btn.prop("disabled", true);

                try {
                    await loadTrip(tripDate, tripTime, tripId);

                    currentTripId = tripId;
                    currentTripDate = tripDate;
                    currentTripTime = tripTime;

                    $(".member-info").css("display", "none");
                    $(".blackout").css("display", "none");
                } catch (error) {
                    currentTripId = previousTripState.id;
                    currentTripDate = previousTripState.date;
                    currentTripTime = previousTripState.time;

                    const status = error?.status || error?.statusCode || error?.responseJSON?.status;
                    const errorCode = error?.responseJSON?.code || error?.responseJSON?.errorCode;
                    const notFound = status === 404 || errorCode === "TRIP_NOT_FOUND";

                    if (notFound) {
                        const fallbackMessage = "Bu bilet için aktif bir sefer bulunamadı.";
                        const message = error?.responseJSON?.message || fallbackMessage;
                        console.warn("Trip not found for ticket", { tripId, tripDate, tripTime, error });
                        showMemberTicketFeedback($btn, message);
                    } else {
                        console.error(error);
                        showError("Sefer bilgisi yüklenemedi.");
                    }
                } finally {
                    $btn.prop("disabled", false);
                }
            });
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

const initializeReportPopup = async (reportKey, popup) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);

    const setupReportDatePicker = (input, defaultDate) => {
        if (!input) {
            return;
        }

        const options = {
            enableTime: true,
            dateFormat: "Y-m-d H:i",
            time_24hr: true,
            altInput: true,
            altFormat: "d F Y H:i",
            locale: "tr",
        };

        if (defaultDate) {
            options.defaultDate = defaultDate;
        }

        flatpickr(input, options);
    };
    if ((reportKey === "salesAndRefunds" || reportKey === "webTickets") && !popup.data("initialized")) {
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

        setupReportDatePicker(popup.find(".report-start")[0], startOfDay);
        setupReportDatePicker(popup.find(".report-end")[0], endOfDay);

        popup.data("initialized", true);
    }
    if (report === "externalReturnTickets" && !popup.data("initialized")) {
        try {
            const branches = await fetch("/get-branches-list?onlyData=true").then(r => r.json());
            const branchSel = popup.find(".report-branch").empty().append('<option value="">Seçiniz</option>');
            branches.forEach(b => branchSel.append(`<option value="${b.id}">${b.title}</option>`));

            branchSel.off("change").on("change", async function () {
                const id = $(this).val();
                const userSel = popup.find(".report-user").empty().append('<option value="">Seçiniz</option>');
                if (id) {
                    try {
                        const users = await fetch(`/get-users-by-branch?id=${id}`).then(r => r.json());
                        users.forEach(u => userSel.append(`<option value="${u.id}">${u.name}</option>`));
                    } catch (err) {
                        console.error("externalReturnTickets users load error", err);
                    }
                }
            });

            const startInput = popup.find(".report-start")[0];
            setupReportDatePicker(startInput, startOfDay);

            const endInput = popup.find(".report-end")[0];
            setupReportDatePicker(endInput, endOfDay);

            popup.data("initialized", true);
        } catch (err) {
            console.error("externalReturnTickets init error", err);
        }
    }

    if (report === "externalReturnTickets" && !popup.data("initialized")) {
        try {
            const branches = await fetch("/get-branches-list?onlyData=true").then(r => r.json());
            const branchSel = popup.find(".report-branch").empty().append('<option value="">Seçiniz</option>');
            branches.forEach(b => branchSel.append(`<option value="${b.id}">${b.title}</option>`));

            branchSel.off("change").on("change", async function () {
                const id = $(this).val();
                const userSel = popup.find(".report-user").empty().append('<option value="">Seçiniz</option>');
                if (id) {
                    try {
                        const users = await fetch(`/get-users-by-branch?id=${id}`).then(r => r.json());
                        users.forEach(u => userSel.append(`<option value="${u.id}">${u.name}</option>`));
                    } catch (err) {
                        console.error("externalReturnTickets users load error", err);
                    }
                }
            });

            const startInput = popup.find(".report-start")[0];
            setupReportDatePicker(startInput, startOfDay);

            const endInput = popup.find(".report-end")[0];
            setupReportDatePicker(endInput, endOfDay);

            popup.data("initialized", true);
        } catch (err) {
            console.error("externalReturnTickets init error", err);
        }
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

        const startInput = popup.find(".report-start")[0];
        setupReportDatePicker(startInput, startOfDay);

        const endInput = popup.find(".report-end")[0];
        setupReportDatePicker(endInput, endOfDay);

        popup.data("initialized", true);
    }

    if (reportKey === "busTransactions" && !popup.data("initialized")) {
        try {
            const buses = await fetch("/get-buses-data").then(r => r.json());
            const busSelect = popup.find(".report-bus").empty().append('<option value="">Tümü</option>');
            buses.forEach(bus => {
                const title = bus.licensePlate ? bus.licensePlate : `Otobüs #${bus.id}`;
                busSelect.append(`<option value="${bus.id}">${title}</option>`);
            });
        } catch (err) {
            console.error("busTransactions buses load error", err);
        }

        const startInput = popup.find(".report-start")[0];
        setupReportDatePicker(startInput, startOfDay);

        const endInput = popup.find(".report-end")[0];
        setupReportDatePicker(endInput, endOfDay);

        popup.data("initialized", true);
    }
};

const showReportPopup = async (reportKey, source = "reports") => {
    const popup = $(`.${reportKey}-report-popup`);
    if (!popup.length) {
        return;
    }

    report = reportKey;
    popup.data("source", source);

    if (reportKey === "busTransactions") {
        const busSelect = popup.find(".report-bus");
        if (busSelect.length) {
            busSelect.val("");
        }
    }

    $(".blackout").css("display", "block");
    $(".reports-popup").css("display", "none");
    popup.css("display", "flex");

    try {
        await initializeReportPopup(reportKey, popup);
    } catch (err) {
        console.error(`${reportKey} popup init error`, err);
    }
};

$(".bus-transactions-report-nav").on("click", async e => {
    e.preventDefault();
    await showReportPopup("busTransactions", "nav");
});

$(".report-item").on("click", async e => {
    const reportKey = $(e.currentTarget).data("report");
    await showReportPopup(reportKey, "reports");
});

$(".report-close").on("click", e => {
    const popup = $(e.currentTarget).closest(".report-popup");
    popup.css("display", "none");
    const source = popup.data("source");
    popup.removeData("source");

    if (source === "reports") {
        $(".reports-popup").css("display", "flex");
    } else {
        $(".blackout").css("display", "none");
    }

    report = null;
});

$(".report-create-button").on("click", e => {
    if (!report) {
        return;
    }

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
    const busId = popup.find(".report-bus").val();

    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (type) params.set("type", type);
    if (branchId) params.set("branchId", branchId);
    if (userId) params.set("userId", userId);
    if (fromStopId) params.set("fromStopId", fromStopId);
    if (toStopId) params.set("toStopId", toStopId);
    if (groupBy) params.set("groupBy", groupBy);
    if (busId) params.set("busId", busId);

    window.open(`/${report}?${params.toString()}`, "_blank");
});

$(".members-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".members").css("display", "none")
})

$(".member-info-close").on("click", e => {
    const popup = $(".member-info");
    const origin = popup.data("origin");
    popup.css("display", "none");
    if (origin === "members") {
        $(".members").css("display", "block");
    } else if (origin === "customers") {
        $(".customers").css("display", "block");
    } else {
        $(".blackout").css("display", "none");
    }
});

$(".member-info-save").on("click", async e => {
    const popup = $(".member-info");
    const customerId = popup.data("customerId");
    if (!customerId) {
        return;
    }

    const payload = {
        id: customerId,
        idNumber: $(".member-info-idNumber").val(),
        name: $(".member-info-name").val(),
        surname: $(".member-info-surname").val(),
        phone: $(".member-info-phone").val(),
        gender: $(".member-info-gender").val(),
        customerType: $(".member-info-type").val(),
        customerCategory: $(".member-info-category").val(),
        pointOrPercent: $(".member-info-pointorpercent").val(),
        pointAmount: $(".member-info-pointamount").val(),
        percent: $(".member-info-percent").val()
    };

    const button = $(e.currentTarget);
    if (!button.data("defaultText")) {
        button.data("defaultText", button.text());
    }
    const defaultText = button.data("defaultText");
    button.prop("disabled", true).text("Kaydediliyor...");

    $.ajax({
        url: "/post-update-customer",
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify(payload),
        success: function (resp) {
            button.text("Kaydedildi");
            const updated = resp && resp.customer ? resp.customer : null;
            if (updated) {
                const valueOrEmpty = (value) => (value === undefined || value === null ? "" : value);
                $(".member-info-idNumber").val(valueOrEmpty(updated.idNumber));
                $(".member-info-name").val(valueOrEmpty(updated.name));
                $(".member-info-surname").val(valueOrEmpty(updated.surname));
                $(".member-info-phone").val(valueOrEmpty(updated.phoneNumber));
                $(".member-info-gender").val(valueOrEmpty(updated.gender));
                $(".member-info-type").val(valueOrEmpty(updated.customerType));
                $(".member-info-category").val(valueOrEmpty(updated.customerCategory));
                $(".member-info-pointorpercent").val(valueOrEmpty(updated.pointOrPercent));
                $(".member-info-pointamount").val(valueOrEmpty(updated.point_amount));
                $(".member-info-percent").val(valueOrEmpty(updated.percent));
                updateMemberPointOrPercentAvailability();
                popup.data("customerId", updated.id);

                const sourceRowEl = popup.data("sourceRow");
                if (sourceRowEl) {
                    const sourceRow = $(sourceRowEl);
                    sourceRow.data("idnumber", valueOrEmpty(updated.idNumber));
                    sourceRow.data("name", valueOrEmpty(updated.name));
                    sourceRow.data("surname", valueOrEmpty(updated.surname));
                    sourceRow.data("phone", valueOrEmpty(updated.phoneNumber));
                    sourceRow.data("gender", valueOrEmpty(updated.gender));
                    sourceRow.data("customertype", valueOrEmpty(updated.customerType));
                    sourceRow.data("customercategory", valueOrEmpty(updated.customerCategory));
                    sourceRow.data("pointorpercent", valueOrEmpty(updated.pointOrPercent));
                    sourceRow.data("pointamount", valueOrEmpty(updated.point_amount));
                    sourceRow.data("percent", valueOrEmpty(updated.percent));

                    if (sourceRow.hasClass("member-row")) {
                        const cols = sourceRow.children();
                        cols.eq(0).find("p").text(valueOrEmpty(updated.idNumber));
                        cols.eq(1).find("p").text(valueOrEmpty(updated.name));
                        cols.eq(2).find("p").text(valueOrEmpty(updated.surname));
                        cols.eq(3).find("p").text(valueOrEmpty(updated.phoneNumber));
                        const pointLabel = updated.pointOrPercent === "point" ? "Puan" : updated.pointOrPercent === "percent" ? "İndirim (%)" : "";
                        const pointValue = updated.pointOrPercent === "point"
                            ? `${valueOrEmpty(updated.point_amount) || 0} puan`
                            : updated.pointOrPercent === "percent"
                                ? `${valueOrEmpty(updated.percent) || 0}%`
                                : "";
                        cols.eq(4).find("p").text(pointLabel);
                        cols.eq(5).find("p").text(pointValue);
                    } else if (sourceRow.hasClass("customer-row")) {
                        const cols = sourceRow.children();
                        cols.eq(0).find("p").text(valueOrEmpty(updated.idNumber));
                        cols.eq(1).find("p").text(valueOrEmpty(updated.name));
                        cols.eq(2).find("p").text(valueOrEmpty(updated.surname));
                        cols.eq(3).find("p").text(valueOrEmpty(updated.phoneNumber));
                        const categoryCol = cols.eq(4).find("p");
                        if (categoryCol.length) {
                            categoryCol.text(updated.customerCategory === "member" ? "Abone" : "");
                        }
                    }
                }
            }
            setTimeout(() => {
                button.text(defaultText);
            }, 2000);
        },
        error: function (xhr, status, error) {
            console.log(error);
            button.text(defaultText);
        },
        complete: function () {
            button.prop("disabled", false);
        }
    });
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
                $(".member-search-idNumber").val("")
                $(".member-search-name").val("")
                $(".member-search-surname").val("")
                $(".member-search-phone").val("")
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
    const name = ($(".user-name").val() || "").trim()
    const username = ($(".user-username").val() || "").trim()
    const password = ($(".user-password").val() || "").trim()
    const phone = ($(".user-phone").val() || "").trim()
    const branchId = $(".user-branches").val()

    $(".user-name").val(name)
    $(".user-username").val(username)
    $(".user-password").val(password)
    $(".user-phone").val(phone)

    if (!name || !username || !password || !branchId) {
        showError("Lütfen Ad Soyad, Kullanıcı Adı, Şifre ve Şube alanlarını doldurunuz.")
        return
    }

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
    $(".payment-request-user").val("");
    $(".payment-request-amount").val("");
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
    $(".payment-send-user").val("");
    $(".payment-send-amount").val("");
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

(function () {
    const SELECTOR = "select[data-searchable-select]";
    const instances = new Set();
    const selectToInstance = new WeakMap();
    let idCounter = 0;

    const stripDiacritics = value => {
        if (typeof value !== "string") {
            return "";
        }

        return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    };

    const toLocaleLower = value => {
        if (typeof value !== "string") {
            if (value === undefined || value === null) {
                return "";
            }
            value = String(value);
        }

        let lowered;
        try {
            lowered = value.toLocaleLowerCase("tr-TR");
        } catch (error) {
            lowered = value.toLowerCase();
        }

        return stripDiacritics(lowered);
    };

    const normalizeForComparison = value => toLocaleLower(value).replace(/\s+/g, " ").trim();

    class SearchableSelect {
        constructor(select) {
            this.select = select;
            this.originalParent = select.parentNode;
            this.originalNextSibling = select.nextSibling;
            this.placeholder = select.getAttribute("data-placeholder")
                || select.getAttribute("placeholder")
                || "Seçiniz";
            this.searchPlaceholder = select.getAttribute("data-search-placeholder") || "Ara...";
            this.noResultsText = select.getAttribute("data-no-results-text") || "Sonuç bulunamadı";
            this.id = `searchable-select-${++idCounter}`;
            this.isOpen = false;
            this.highlightIndex = -1;
            this.filteredOptions = [];
            this.options = [];
            this.isSyncing = false;
            this.allowCustomValues = this.select.hasAttribute("data-allow-new");

            this.build();
            this.refreshOptions();
            this.bindEvents();
            this.syncFromSelect();
            this.filter("");

            this.select.dataset.searchableSelectReady = "true";
        }

        build() {
            this.container = document.createElement("div");
            this.container.className = "searchable-select";

            if (this.originalParent) {
                this.originalParent.insertBefore(this.container, this.select);
            }

            this.container.appendChild(this.select);

            this.select.classList.add("searchable-select__native");
            this.select.setAttribute("tabindex", "-1");

            this.display = document.createElement("button");
            this.display.type = "button";
            this.display.className = "searchable-select__display";
            this.display.setAttribute("role", "combobox");
            this.display.setAttribute("aria-haspopup", "listbox");
            this.display.setAttribute("aria-expanded", "false");
            this.display.setAttribute("aria-controls", `${this.id}-listbox`);

            this.displayText = document.createElement("span");
            this.displayText.className = "searchable-select__text";
            this.display.appendChild(this.displayText);

            this.dropdown = document.createElement("div");
            this.dropdown.className = "searchable-select__dropdown";

            this.searchInput = document.createElement("input");
            this.searchInput.type = "text";
            this.searchInput.className = "searchable-select__search";
            this.searchInput.placeholder = this.searchPlaceholder;
            this.searchInput.setAttribute("autocomplete", "off");
            this.dropdown.appendChild(this.searchInput);

            this.optionsList = document.createElement("div");
            this.optionsList.className = "searchable-select__options";
            this.optionsList.id = `${this.id}-listbox`;
            this.optionsList.setAttribute("role", "listbox");
            this.dropdown.appendChild(this.optionsList);

            this.container.appendChild(this.display);
            this.container.appendChild(this.dropdown);
        }

        refreshOptions() {
            const optionElements = Array.from(this.select.options || []);
            this.options = optionElements
                .filter(option => !option.disabled && !option.hidden)
                .map(option => {
                    const rawLabel = option.textContent != null ? option.textContent : "";
                    const label = rawLabel.trim() || option.label || option.value || "";
                    const searchSource = option.dataset && option.dataset.searchText
                        ? option.dataset.searchText
                        : `${label} ${option.value}`;
                    return {
                        value: option.value,
                        label,
                        searchText: toLocaleLower(searchSource),
                    };
                });
        }

        bindEvents() {
            this.handleDisplayClick = event => {
                event.preventDefault();
                this.toggle();
            };

            this.handleDisplayKeydown = event => {
                if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
                    event.preventDefault();
                    this.toggle(true);
                    return;
                }

                if (event.key === "ArrowDown") {
                    event.preventDefault();
                    if (!this.isOpen) {
                        this.open();
                    }
                    this.moveHighlight(1);
                    return;
                }

                if (event.key === "ArrowUp") {
                    event.preventDefault();
                    if (!this.isOpen) {
                        this.open();
                    }
                    this.moveHighlight(-1);
                    return;
                }

                if (event.key && event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
                    this.open();
                    this.searchInput.value = event.key;
                    this.filter(this.searchInput.value);
                    window.requestAnimationFrame(() => {
                        const length = this.searchInput.value.length;
                        this.searchInput.setSelectionRange(length, length);
                    });
                    event.preventDefault();
                }
            };

            this.handleSearchInput = event => {
                this.filter(event.target.value);
            };

            this.handleSearchKeydown = event => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    this.close();
                    this.display.focus();
                    return;
                }

                if (event.key === "ArrowDown") {
                    event.preventDefault();
                    this.moveHighlight(1);
                    return;
                }

                if (event.key === "ArrowUp") {
                    event.preventDefault();
                    this.moveHighlight(-1);
                    return;
                }

                if (event.key === "Enter") {
                    event.preventDefault();
                    if (this.highlightIndex >= 0) {
                        const option = this.filteredOptions[this.highlightIndex];
                        if (option) {
                            this.chooseOption(option);
                        }
                    } else if (this.allowCustomValues) {
                        this.addCustomOptionFromInput();
                    }
                }
            };

            this.handleNativeChange = () => {
                if (this.isSyncing) {
                    return;
                }
                this.refreshOptions();
                this.syncFromSelect();
            };

            this.display.addEventListener("click", this.handleDisplayClick);
            this.display.addEventListener("keydown", this.handleDisplayKeydown);
            this.searchInput.addEventListener("input", this.handleSearchInput);
            this.searchInput.addEventListener("keydown", this.handleSearchKeydown);
            this.select.addEventListener("change", this.handleNativeChange);
        }

        toggle(forceOpen = false) {
            if (forceOpen && this.isOpen) {
                return;
            }

            if (forceOpen || !this.isOpen) {
                this.open();
            } else {
                this.close();
            }
        }

        open() {
            instances.forEach(instance => {
                if (instance !== this) {
                    instance.close();
                }
            });

            this.isOpen = true;
            this.container.classList.add("searchable-select_open");
            this.display.setAttribute("aria-expanded", "true");
            this.refreshOptions();
            this.searchInput.value = "";
            this.filter("");

            window.requestAnimationFrame(() => {
                this.searchInput.focus();
            });
        }

        close() {
            if (!this.isOpen) {
                return;
            }

            this.isOpen = false;
            this.container.classList.remove("searchable-select_open");
            this.display.setAttribute("aria-expanded", "false");
            this.display.removeAttribute("aria-activedescendant");
        }

        moveHighlight(delta) {
            if (!this.filteredOptions.length) {
                this.highlightIndex = -1;
                this.updateHighlight();
                return;
            }

            if (this.highlightIndex === -1) {
                this.highlightIndex = delta > 0 ? 0 : this.filteredOptions.length - 1;
            } else {
                this.highlightIndex = Math.max(0, Math.min(this.filteredOptions.length - 1, this.highlightIndex + delta));
            }

            this.updateHighlight();
        }

        filter(term) {
            const rawTerm = typeof term === "string" ? term : "";
            const trimmed = rawTerm.trim();
            const normalized = toLocaleLower(rawTerm).trim();

            if (!normalized) {
                this.filteredOptions = this.options.slice();
            } else {
                this.filteredOptions = this.options.filter(option => option.searchText.includes(normalized));
            }

            if (this.allowCustomValues && trimmed) {
                const normalizedTrimmed = normalizeForComparison(trimmed);
                const hasExactOption = this.options.some(option => {
                    return normalizeForComparison(option.label) === normalizedTrimmed
                        || normalizeForComparison(option.value) === normalizedTrimmed;
                });

                if (!hasExactOption) {
                    this.filteredOptions.push({
                        value: trimmed,
                        label: trimmed,
                        searchText: toLocaleLower(trimmed),
                        isCustom: true,
                    });
                }
            }

            const selectedValue = this.select.value;
            const selectedIndex = this.filteredOptions.findIndex(option => !option.isCustom && option.value === selectedValue);
            if (selectedIndex !== -1) {
                this.highlightIndex = selectedIndex;
            } else {
                this.highlightIndex = this.filteredOptions.length ? 0 : -1;
            }

            this.renderOptions();
        }

        renderOptions() {
            this.optionsList.innerHTML = "";

            if (!this.filteredOptions.length) {
                const empty = document.createElement("div");
                empty.className = "searchable-select__empty";
                empty.textContent = this.noResultsText;
                this.optionsList.appendChild(empty);
                this.display.removeAttribute("aria-activedescendant");
                return;
            }

            const currentValue = this.select.value;

            this.filteredOptions.forEach((option, index) => {
                const optionEl = document.createElement("div");
                optionEl.className = "searchable-select__option";
                optionEl.setAttribute("role", "option");
                optionEl.id = `${this.id}-option-${index}`;
                optionEl.dataset.value = option.value;

                if (option.isCustom) {
                    optionEl.classList.add("searchable-select__option--create");
                    optionEl.textContent = `"${option.label}" değerini ekle`;
                    optionEl.setAttribute("aria-selected", "false");
                } else {
                    optionEl.textContent = option.label;

                    const isSelected = option.value === currentValue;
                    if (isSelected) {
                        optionEl.classList.add("is-selected");
                        optionEl.setAttribute("aria-selected", "true");
                    } else {
                        optionEl.setAttribute("aria-selected", "false");
                    }
                }

                if (index === this.highlightIndex) {
                    optionEl.classList.add("is-highlighted");
                    this.display.setAttribute("aria-activedescendant", optionEl.id);
                }

                optionEl.addEventListener("pointerdown", event => {
                    event.preventDefault();
                    this.chooseOption(option);
                });

                optionEl.addEventListener("mouseenter", () => {
                    this.setHighlight(index);
                });

                this.optionsList.appendChild(optionEl);
            });

            if (this.highlightIndex === -1) {
                this.display.removeAttribute("aria-activedescendant");
            } else {
                this.scrollHighlightedIntoView();
            }
        }

        addCustomOptionFromInput(value = null) {
            if (!this.allowCustomValues) {
                return;
            }

            if (value != null && this.searchInput) {
                this.searchInput.value = value;
            }

            const rawValue = value != null ? value : (this.searchInput ? this.searchInput.value : "");
            const trimmed = typeof rawValue === "string" ? rawValue.trim() : "";
            if (!trimmed) {
                return;
            }

            const normalized = normalizeForComparison(trimmed);
            if (!normalized) {
                return;
            }

            const existingOptionElement = Array.from(this.select.options || []).find(option => {
                const source = option && option.textContent != null && option.textContent !== ""
                    ? option.textContent
                    : (option?.label || option?.value || "");
                return normalizeForComparison(source) === normalized;
            });

            if (existingOptionElement) {
                const existingValue = existingOptionElement.value;
                if ((existingOptionElement.textContent || "").trim() !== trimmed) {
                    existingOptionElement.textContent = trimmed;
                }
                this.refreshOptions();
                this.setValue(existingValue);
                this.close();
                this.display.focus();
                return;
            }

            const newOption = new Option(trimmed, trimmed, true, true);
            newOption.dataset.customOption = "true";
            this.select.appendChild(newOption);
            this.refreshOptions();
            this.setValue(newOption.value);
            this.close();
            this.display.focus();
        }

        setHighlight(index) {
            if (index < 0 || index >= this.filteredOptions.length) {
                this.highlightIndex = -1;
            } else {
                this.highlightIndex = index;
            }
            this.updateHighlight();
        }

        updateHighlight() {
            const optionElements = this.optionsList.querySelectorAll(".searchable-select__option");
            optionElements.forEach((element, index) => {
                const isHighlighted = index === this.highlightIndex;
                element.classList.toggle("is-highlighted", isHighlighted);
                if (isHighlighted) {
                    this.display.setAttribute("aria-activedescendant", element.id);
                }
            });

            if (this.highlightIndex === -1) {
                this.display.removeAttribute("aria-activedescendant");
            } else {
                this.scrollHighlightedIntoView();
            }
        }

        scrollHighlightedIntoView() {
            if (!this.isOpen) {
                return;
            }

            const element = this.optionsList.querySelector(".searchable-select__option.is-highlighted");
            if (element && typeof element.scrollIntoView === "function") {
                element.scrollIntoView({ block: "nearest" });
            }
        }

        chooseOption(option) {
            if (option && option.isCustom) {
                this.addCustomOptionFromInput(option.value);
                return;
            }

            this.setValue(option.value);
            this.close();
            this.display.focus();
        }

        setValue(value) {
            const previousValue = this.select.value;
            if (previousValue === value) {
                this.syncFromSelect();
                return;
            }

            this.isSyncing = true;
            this.select.value = value;
            const changeEvent = new Event("change", { bubbles: true });
            this.select.dispatchEvent(changeEvent);
            this.isSyncing = false;
            this.syncFromSelect();
        }

        syncFromSelect() {
            const currentValue = this.select.value;
            const currentOption = this.options.find(option => option.value === currentValue) || null;
            if (currentOption) {
                this.displayText.textContent = currentOption.label;
                this.container.classList.add("searchable-select_has-value");
            } else {
                this.displayText.textContent = this.placeholder;
                this.container.classList.remove("searchable-select_has-value");
            }

            if (this.isOpen) {
                this.filter(this.searchInput.value);
            } else {
                this.updateSelectionStyles();
            }
        }

        updateSelectionStyles() {
            const optionElements = this.optionsList.querySelectorAll(".searchable-select__option");
            const currentValue = this.select.value;
            optionElements.forEach((element, index) => {
                const option = this.filteredOptions[index];
                if (!option) {
                    return;
                }
                if (option.isCustom) {
                    element.classList.remove("is-selected");
                    element.setAttribute("aria-selected", "false");
                    return;
                }

                const isSelected = option.value === currentValue;
                element.classList.toggle("is-selected", isSelected);
                element.setAttribute("aria-selected", isSelected ? "true" : "false");
            });
        }

        handleDocumentClick(event) {
            if (!this.container.contains(event.target)) {
                this.close();
            }
        }

        destroy() {
            this.close();

            if (this.display) {
                this.display.removeEventListener("click", this.handleDisplayClick);
                this.display.removeEventListener("keydown", this.handleDisplayKeydown);
            }

            if (this.searchInput) {
                this.searchInput.removeEventListener("input", this.handleSearchInput);
                this.searchInput.removeEventListener("keydown", this.handleSearchKeydown);
            }

            if (this.select) {
                this.select.removeEventListener("change", this.handleNativeChange);
                this.select.classList.remove("searchable-select__native");
                this.select.removeAttribute("tabindex");
                delete this.select.dataset.searchableSelectReady;
            }

            if (this.container && this.originalParent) {
                if (this.originalNextSibling && this.originalNextSibling.parentNode === this.originalParent) {
                    this.originalParent.insertBefore(this.select, this.originalNextSibling);
                } else {
                    this.originalParent.appendChild(this.select);
                }
                this.container.remove();
            }
        }
    }

    const init = root => {
        if (!root) {
            return [];
        }

        let elements = [];
        if (root instanceof HTMLSelectElement) {
            elements = [root];
        } else if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
            elements = Array.from(root.querySelectorAll(SELECTOR));
            if (root instanceof Element && root.matches(SELECTOR)) {
                elements.unshift(root);
            }
        } else if (typeof root.length === "number") {
            const results = [];
            Array.from(root).forEach(item => {
                const createdFromItem = init(item);
                if (Array.isArray(createdFromItem)) {
                    results.push(...createdFromItem);
                }
            });
            return results;
        }

        const created = [];

        elements.forEach(select => {
            if (!(select instanceof HTMLSelectElement)) {
                return;
            }

            if (selectToInstance.has(select)) {
                return;
            }

            const instance = new SearchableSelect(select);
            selectToInstance.set(select, instance);
            instances.add(instance);
            created.push(instance);
        });

        return created;
    };

    const destroy = target => {
        let instance = null;

        if (!target) {
            return false;
        }

        if (target instanceof SearchableSelect) {
            instance = target;
        } else if (target instanceof HTMLSelectElement) {
            instance = selectToInstance.get(target) || null;
        }

        if (!instance) {
            return false;
        }

        instance.destroy();
        selectToInstance.delete(instance.select);
        instances.delete(instance);
        return true;
    };

    const getInstance = target => {
        if (!target) {
            return null;
        }

        if (target instanceof SearchableSelect) {
            return target;
        }

        if (target instanceof HTMLSelectElement) {
            return selectToInstance.get(target) || null;
        }

        return null;
    };

    const boot = () => {
        init(document);
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }

    document.addEventListener("click", event => {
        instances.forEach(instance => instance.handleDocumentClick(event));
    });

    window.GTR = window.GTR || {};
    window.GTR.searchableSelect = {
        init,
        destroy,
        getInstance,
        getInstances: () => Array.from(instances),
    };
})();