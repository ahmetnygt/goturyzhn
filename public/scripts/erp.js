let selectedSeats = []
let selectedTakenSeats = []
let currentTripDate;
let currentTripTime;
let currentTripPlaceTime;
let currentTripId;
let currentStop = "1";
let currentStopStr = "Çanakkale İskele";
let fromId;
let toId;
let fromStr;
let toStr;

// Seferi yükler
async function loadTrip(date, time, tripId) {
    await $.ajax({
        url: "erp/get-trip",
        type: "GET",
        data: { date: date, time: time, stopId: currentStop },
        success: async function (response) {
            console.log(date)
            console.log(time)
            console.log(tripId)
            await $.ajax({
                url: "erp/get-passengers-table",
                type: "GET",
                data: { date: date, time: time, tripId },
                success: function (response) {
                    $(".passenger-table").html(response)
                },
                error: function (xhr, status, error) {
                    console.log(error);
                }
            })

            await $.ajax({
                url: "erp/get-ticketops-popup",
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
                url: "erp/get-trip-notes",
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
                url: "erp/get-route-stops-time-list",
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

            currentTripDate = $("#tripDate").val()
            currentTripTime = $("#tripTime").val()
            currentTripPlaceTime = $("#tripPlaceTime").val()
            currentTripId = $("#tripId").val()

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

            if (isMovingActive) {

                await $.ajax({
                    url: "erp/get-route-stops-list-moving",
                    type: "GET",
                    data: { date: date, time: time, tripId: tripId, stopId: currentStop },
                    success: function (response) {
                        console.log(response)
                        let arr = []
                        const opt = $("<option>").html("").val("")
                        arr.push(opt)
                        for (let i = 0; i < response.length; i++) {
                            const rs = response[i];
                            const opt = $("<option>").html(rs.stopStr).val(rs.stopId)
                            arr.push(opt)
                        }
                        $(".move-to-trip-place-select").html(arr)
                        $(".move-to-trip-date").html(`${new Date(currentTripDate).getDate()}/${Number(new Date(currentTripDate).getMonth()) + 1} | ${currentTripPlaceTime.split(":")[0] + "." + currentTripPlaceTime.split(":")[1]}`)
                        $(".move-to-trip-place").html(`${currentStopStr}`)
                        $(".move-to").css("display", "flex")
                    },
                    error: function (xhr, status, error) {
                        console.log(error);
                    }
                })
            }

            $(document).on("click", function () {
                $(".ticket-ops-pop-up").hide();
                $(".taken-ticket-ops-pop-up").hide();
                currentSeat = null;
            });

            $(".ticket-op").on("click", e => {
                e.stopPropagation();

                $(".ticket-op ul").css("display", "none");

                const ul = e.currentTarget.querySelector("ul");
                const isVisible = $(ul).css("display") === "flex";

                if (!isVisible) {
                    $(ul).css("display", "flex");
                }
            });

            $(document).on("click", () => {
                $(".ticket-op ul").css("display", "none");
            });

            $(".ticket-op-button").on("click", async e => {
                const button = e.currentTarget
                const action = e.currentTarget.dataset.action
                const seat = currentSeat[0].dataset.seatNumber
                const fromId = currentStop
                const toId = button.dataset.stopId

                $(".ticket-ops-pop-up").hide()
                await $.ajax({
                    url: "erp/get-ticket-row",
                    type: "GET",
                    data: { gender: button.dataset.gender, seats: selectedSeats, fromId: fromId, toId: toId },
                    success: function (response) {
                        $(".ticket-info-pop-up_from").html(currentStopStr.toLocaleUpperCase())
                        $(".ticket-info-pop-up_to").html(button.dataset.routeStop.toLocaleUpperCase())

                        $(".ticket-row").remove()
                        $(".ticket-info").remove()
                        $(".ticket-button-action").attr("data-action", action)
                        $(".ticket-button-action").html(action == "sell" ? "SAT" : "REZERVE ET")
                        $(".ticket-rows").prepend(response)
                        $(".ticket-info-pop-up").css("display", "block")
                        $(".blackout").css("display", "block")

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

                if (data.createdAt) {
                    $(".passenger-info-popup").removeClass("m").removeClass("f")
                    $(".passenger-info-popup").addClass(data.gender)
                    $(".passenger-info-popup .seat-number").html(data.seatNumber)
                    $(".passenger-info-popup .from").html(data.from)
                    $(".passenger-info-popup .to").html(data.to)
                    $(".passenger-info-popup .name").html(data.name)
                    $(".passenger-info-popup .phone").html(data.phoneNumber)
                    $(".passenger-info-popup .price").html(data.price)
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
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
}

// Site ilk açıldığında bugünün seferini yükler
$(document).ready(function () {
    loadTrip('2025-05-12', '12:30:00', 1)
    loadTripsList("2025-05-12")
})

// Sefer listesini yükler
async function loadTripsList(dateStr) {
    await $.ajax({
        url: "erp/get-day-trips-list",
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
            url: "erp/get-trips-list",
            type: "GET",
            data: { date },
            success: function (response) {
                $(".trip-list-nodes").html(response)

                $(".trip-button").on("click", async e => {
                    const id = e.currentTarget.dataset.id
                    const time = e.currentTarget.dataset.time
                    editingTripId = id
                    // await $.ajax({
                    //     url: "erp/get-trip",
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
$(document).on("click", () => {
    $(".ticket-op ul").css("display", "none");
});

$("#currentStop").on("change", async (e) => {
    const $sel = $(e.currentTarget);
    currentStop = $sel.val();                               // seçilen value
    currentStopStr = $sel.find("option:selected").text().trim(); // seçilen option'un text'i

    const response = await $.ajax({
        url: "erp/get-day-trips-list",
        type: "GET",
        data: { date: calendar.val(), stopId: currentStop }
    });

    $(".tripRows").html(response);

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
                price: $(ticket).find(".price").find("input").val(),
                payment: $(".ticket-rows").find(".payment").find("select").val(),
            }

            tickets.push(ticketObj)
        }

        const ticketsStr = JSON.stringify(tickets)

        await $.ajax({
            url: "erp/post-tickets",
            type: "POST",
            data: { tickets: ticketsStr, tripDate: currentTripDate, tripTime: currentTripTime, fromId: currentStop, toId, status: "completed" },
            success: async function (response) {
                ticketClose()
                loadTrip(currentTripDate, currentTripTime, currentTripId)
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
                price: $(e).find(".price").find("input").val(),
                pnr: $(".pnr").find("input").val(),
            })
        })


        const ticketStr = JSON.stringify(ticketArray)

        await $.ajax({
            url: "erp/post-edit-ticket",
            type: "POST",
            data: { tickets: ticketStr, tripDate: currentTripDate, tripTime: currentTripTime, fromId: currentStop, toId },
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
                price: $(ticket).find(".price").find("input").val(),
            }

            tickets.push(ticketObj)
        }

        const ticketsStr = JSON.stringify(tickets)

        await $.ajax({
            url: "erp/post-tickets",
            type: "POST",
            data: { tickets: ticketsStr, tripDate: currentTripDate, tripTime: currentTripTime, fromId: currentStop, toId, status: "reservation" },
            success: async function (response) {
                ticketClose()
                loadTrip(currentTripDate, currentTripTime, currentTripId)
            },
            error: function (xhr, status, error) {
                console.log(error);
            }
        });

    }
    else if (e.currentTarget.dataset.action == "cancel/refund") {

        if (selectedTakenSeats.length > 0) {
            let json = JSON.stringify(selectedTakenSeats)
            await $.ajax({
                url: "erp/post-cancel-ticket",
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
                url: "erp/post-open-ticket",
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

    if (action == "edit") {
        $(".ticket-button-action").attr("data-action", "edit")
        $(".ticket-button-action").html("KAYDET")
        await $.ajax({
            url: "erp/get-ticket-row",
            type: "GET",
            data: { isTaken: true, seatNumbers: selectedTakenSeats, date: currentTripDate, time: currentTripTime },
            success: function (response) {
                $(".ticket-row").remove()
                $(".ticket-info").remove()
                $(".ticket-rows").prepend(response)
                $(".ticket-info-pop-up").css("display", "block")
                $(".blackout").css("display", "block")

                $(".taken-ticket-ops-pop-up").hide()

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
    }

    else if (action == "cancel/refund") {
        $(".ticket-button-action").attr("data-action", "cancel/refund")

        let pnr = null
        const seat = selectedTakenSeats[0];
        pnr = $(`.seat.seat-${seat}`).data("pnr")
        cancelingSeatPNR = pnr

        await $.ajax({
            url: "erp/get-cancel-open-ticket",
            type: "GET",
            data: { pnr: pnr, seats: selectedTakenSeats, date: currentTripDate, time: currentTripTime },
            success: function (response) {
                $(".ticket-cancel-refund-open .gtr-header span").html("BİLET İPTAL/İADE")
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
                            $(".cancel-action-button").html(`${selectedTakenSeats.length} ADET İPTAL / İADE ET`)
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
                        $(".cancel-action-button").html(`${selectedTakenSeats.length} ADET İPTAL / İADE ET`)
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
        $(".ticket-button-action").attr("data-action", "cancel/refund")

        let pnr = null
        const seat = selectedTakenSeats[0];
        pnr = $(`.seat.seat-${seat}`).data("pnr")
        cancelingSeatPNR = pnr

        await $.ajax({
            url: "erp/get-cancel-open-ticket",
            type: "GET",
            data: { pnr: pnr, seats: selectedTakenSeats, date: currentTripDate, time: currentTripTime },
            success: function (response) {
                $(".ticket-cancel-refund-open .gtr-header span").html("BİLET AÇIĞA AL")
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
            url: "erp/get-move-ticket",
            type: "GET",
            data: { pnr: movingSeatPNR, tripId: currentTripId, stopId: currentStop },
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
})

$(".moving-confirm").on("click", async e => {
    await $.ajax({
        url: "erp/post-move-tickets",
        type: "POST",
        data: { pnr: movingSeatPNR, oldSeats: JSON.stringify(movingSelectedSeats), newSeats: JSON.stringify(selectedSeats), newTrip: currentTripId, fromId: currentStop, toId: $(".move-to-trip-place-select").val() ? $(".move-to-trip-place-select").val() : toId },
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

$(".ticket-close").on("click", e => {
    ticketClose();
})
$(".ticket-button-cancel").on("click", e => {
    ticketClose();
})

$(".add-trip-note-button").on("click", e => {
    $(".blackout").css("display", "block")
    $(".add-trip-note").css("display", "flex")
})

$(".trip-note-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".add-trip-note").css("display", "none")
})

// $(".save-trip-note").on("click", async e => {
//     await $.ajax({
//         url: "erp/get-trip-notes",
//         type: "GET",
//         data: { date: date, time: time },
//         success: function (response) {
//             $(".trip-notes").html(response)
//         },
//         error: function (xhr, status, error) {
//             console.log(error);
//         }
//     })
//     $(".blackout").css("display", "none")
//     $(".add-trip-note").css("display", "none")
// })

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

    await $.ajax({
        url: "erp/get-search-table",
        type: "GET",
        data: { name, surname, idnum, phone, pnr },
        success: function (response) {
            $(".searched-table").html(response)
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

let isRegisterShown = false
$(".register-nav").on("click", async e => {
    await $.ajax({
        url: "erp/get-transactions-list",
        type: "GET",
        data: {},
        success: async function (response) {
            $(".transaction-list").html(response)

            await $.ajax({
                url: "erp/get-transaction-data",
                type: "GET",
                data: {},
                success: function (response) {
                    const cashSales = Number(response.cashSales) || 0;
                    const cardSales = Number(response.cardSales) || 0;
                    const cashRefund = Number(response.cashRefund) || 0;
                    const cardRefund = Number(response.cardRefund) || 0;
                    const transferIn = Number(response.transferIn) || 0;
                    const payedToBus = Number(response.payedToBus) || 0;
                    const otherIn = Number(response.otherIn) || 0;
                    const otherOut = Number(response.otherOut) || 0;
                    const inSum = cashSales + cardSales + transferIn + otherIn
                    const outSum = cashRefund + cardRefund + payedToBus + otherOut
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
                    $(".other-expense").val(otherOut)
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
        url: "erp/post-add-transaction",
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
                    url: "erp/get-transactions-list",
                    type: "GET",
                    data: {},
                    success: async function (response) {
                        $(".transaction-list").html(response)
                        await $.ajax({
                            url: "erp/get-transaction-data",
                            type: "GET",
                            data: {},
                            success: function (response) {
                                const cashSales = Number(response.cashSales) || 0;
                                const cardSales = Number(response.cardSales) || 0;
                                const cashRefund = Number(response.cashRefund) || 0;
                                const cardRefund = Number(response.cardRefund) || 0;
                                const transferIn = Number(response.transferIn) || 0;
                                const payedToBus = Number(response.payedToBus) || 0;
                                const otherIn = Number(response.otherIn) || 0;
                                const otherOut = Number(response.otherOut) || 0;
                                const inSum = cashSales + cardSales + transferIn + otherIn
                                const outSum = cashRefund + cardRefund + payedToBus + otherOut
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
                                $(".other-expense").val(otherOut)
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
            console.log(error);
        }
    })
})

$(".bus-plans-nav").on("click", async e => {
    $(".bus-plans").css("display", "block")
    $(".blackout").css("display", "block")
})

$(".bus-plans-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".bus-plans").css("display", "none")
})

let editingBusPlanId = null
$(".bus-plan-button").on("click", async e => {
    const id = e.currentTarget.dataset.id
    editingBusPlanId = id

    await $.ajax({
        url: "erp/get-bus-plan-panel",
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
                    url: "erp/post-save-bus-plan",
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
        url: "erp/get-bus-plan-panel",
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
                    url: "erp/post-save-bus-plan",
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
    await $.ajax({
        url: "erp/get-buses-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".bus-list-nodes").html(response)

            $(".bus-button").on("click", async e => {
                const id = e.currentTarget.dataset.id
                const licensePlate = e.currentTarget.dataset.licensePlate
                editingBusId = id
                await $.ajax({
                    url: "erp/get-bus",
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
        url: "erp/post-save-bus",
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

let editingStopId = null
$(".stops-nav").on("click", async e => {
    await $.ajax({
        url: "erp/get-stops-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".stop-list-nodes").html(response)

            $(".stop-button").on("click", async e => {
                const id = e.currentTarget.dataset.id
                editingStopId = id
                await $.ajax({
                    url: "erp/get-stop",
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
        url: "erp/post-save-stop",
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
        url: "erp/get-routes-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".route-list-nodes").html(response)

            $.ajax({
                url: "erp/get-stops-data",
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
                    url: "erp/get-route",
                    type: "GET",
                    data: { id: id, title: title },
                    success: async function (response) {

                        $(".route-code").val(response.routeCode)
                        $(".route-title").val(response.title)
                        $(".route-from").val(response.fromStopId)
                        $(".route-to").val(response.toStopId)
                        $(".route-description").val(response.description)

                        await $.ajax({
                            url: "erp/get-route-stops-list",
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
    editingRouteId = null
    $(".route").css("width", "80vw")
    $(".route-list").removeClass("col-12").addClass("col-4")
    $(".route-info").css("display", "flex")
    $(".route-settings").css("display", "block")
    $(".save-route").html("EKLE")
})


$(".add-route-stop-button").on("click", async e => {
    const stopId = $(".route-stop-place").val()
    const duration = $(".route-stop-duration").val()
    const isFirst = routeStops.length == 0

    await $.ajax({
        url: "erp/get-route-stop",
        type: "GET",
        data: { stopId, duration, isFirst },
        success: function (response) {
            $(".route-stop-duration").css("display", "block")
            $(".route-stop-place").val("")
            $(".route-stop-duration").val("")
            routeStops.push({ stopId, duration })
            $(".route-stops").append(response)
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
        url: "erp/post-save-route",
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
        url: "erp/get-trips-list",
        type: "GET",
        data: { date },
        success: function (response) {
            $(".trip-list-nodes").html(response)

            $(".trip-button").on("click", async e => {
                const id = e.currentTarget.dataset.id
                const time = e.currentTarget.dataset.time
                editingTripId = id
                // await $.ajax({
                //     url: "erp/get-trip",
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
        url: "erp/get-prices-list",
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

$(document).on("click", ".price-list-nodes .d-flex.btn, .price-add-row", function () {
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
        url: "erp/post-save-prices",
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
        url: "erp/post-add-price",
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
            $.get("erp/get-routes-data"),
            $.get("erp/get-bus-models-data"),
            $.get("erp/get-buses-data")
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
        url: "erp/post-save-trip",
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
        url: "erp/get-stops-list",
        type: "GET",
        data: { onlyData: true }
    });

    const stopOptions = ["<option value=\"\" selected></option>"];
    for (const s of stops) {
        stopOptions.push(`<option value="${s.id}">${s.title}</option>`);
    }
    $(".branch-place").html(stopOptions);

    const branches = await $.ajax({
        url: "erp/get-branches-list",
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
        url: "erp/get-branches-list",
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
                    url: "erp/get-branch",
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

$(".branch-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".branch").css("display", "none")
})

$(".add-branch").on("click", async e => {
    await loadBranchOptions();
    $("#isBranchActive").prop('checked', false)
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
        url: "erp/post-save-branch",
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
$(".user-settings-nav").on("click", async e => {
    await $.ajax({
        url: "erp/get-users-list",
        type: "GET",
        data: {},
        success: function (response) {
            $(".user-list-nodes").html(response)

            $(".user-button").on("click", async e => {
                const id = e.currentTarget.dataset.id
                const username = e.currentTarget.dataset.username
                editingUserId = id
                await $.ajax({
                    url: "erp/get-user",
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
        url: "erp/get-customers-list",
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

$(".customer-search-btn").on("click", async e => {
    const idNumber = $(".customer-search-idNumber").val();
    const name = $(".customer-search-name").val();
    const surname = $(".customer-search-surname").val();
    const phone = $(".customer-search-phone").val();

    await $.ajax({
        url: "erp/get-customers-list",
        type: "GET",
        data: { idNumber, name, surname, phone, blacklist: 0 },
        success: function (response) {
            $(".customer-list-nodes").html(response)
            $(".blacklist-reason-header").hide()
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
        url: "erp/get-customers-list",
        type: "GET",
        data: { idNumber, name, surname, phone, blacklist: 1 },
        success: function (response) {
            $(".customer-list-nodes").html(response)
            $(".blacklist-reason-header").show()
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    })
})

$(document).on("click", ".customer-blacklist-open", function (e) {
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
        url: "erp/post-customer-blacklist",
        type: "POST",
        data: { id, description },
        success: function () {
            $(".customer-blacklist-pop-up").css("display", "none");
            $(".blackout").css("display", "none");
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
        url: "erp/get-members-list",
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

$(".members-close").on("click", e => {
    $(".blackout").css("display", "none")
    $(".members").css("display", "none")
})

function filterMembers() {
    const id = $(".member-search-idNumber").val().toLowerCase()
    const name = $(".member-search-name").val().toLowerCase()
    const surname = $(".member-search-surname").val().toLowerCase()
    const phone = $(".member-search-phone").val().toLowerCase()

    $(".member-row").each(function () {
        const row = $(this)
        const match = row.data("id").toLowerCase().includes(id) &&
            row.data("name").toLowerCase().includes(name) &&
            row.data("surname").toLowerCase().includes(surname) &&
            row.data("phone").toLowerCase().includes(phone)
        row.toggle(match)
    })
}

$(".member-search-idNumber, .member-search-name, .member-search-surname, .member-search-phone").on("input", filterMembers)

$(".member-search-btn").on("click", filterMembers)

$(".member-add-btn").on("click", async e => {
    const idNumber = $(".member-search-idNumber").val()
    const name = $(".member-search-name").val()
    const surname = $(".member-search-surname").val()
    const phone = $(".member-search-phone").val()

    await $.ajax({
        url: "erp/post-add-member",
        type: "POST",
        data: {
            idNumber: idNumber,
            name: name,
            surname: surname,
            phone: phone
        },
        success: async function (response) {
            await $.ajax({
                url: "erp/get-members-list",
                type: "GET",
                data: {},
                success: function (resp) {
                    $(".member-list-nodes").html(resp)
                    filterMembers()
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

$(".add-user").on("click", e => {
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
})

$(".save-user").on("click", async e => {
    const isActive = $("#isUserActive").prop("checked")
    const name = $(".user-name").val()
    const username = $(".user-username").val()
    const password = $(".user-password").val()
    const phone = $(".user-phone").val()
    const branchId = $(".user-branches").val()

    await $.ajax({
        url: "erp/post-save-user",
        type: "POST",
        data: { id: editingUserId, isActive, name, username, password, phone, branchId },
        success: function (response) {
            $("#isUserActive").prop("checked", true)
            $(".user-name").val("")
            $(".user-username").val("")
            $(".user-password").val("")
            $(".user-phone").val("")
            $(".user-branches").val("")
            editingUserId = null
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

$(".transaction-transfer-nav").on("click", async e => {
    await $.ajax({
        url: "erp/get-branches-list",
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
        url: "erp/get-users-by-branch",
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
        url: "erp/post-transfer-register",
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