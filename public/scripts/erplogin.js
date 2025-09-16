$(".login-button").on("click", async e => {
    const username = $(".username").val()
    const password = $(".password").val()
    await $.ajax({
        url: "/login",
        type: "POST",
        data: { username: username, password: password },
        success: async function (response) {
            console.log(response)
        },
        error: function (xhr, status, error) {
            console.log(error);
        }
    });
})