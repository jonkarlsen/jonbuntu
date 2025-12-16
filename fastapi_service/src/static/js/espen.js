document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("videoModal");
    const modalVideo = document.getElementById("modalVideo");
    const closeBtn = modal.querySelector(".close");

    document.querySelectorAll(".video-thumbnail").forEach(thumbnail => {
        thumbnail.addEventListener("click", () => {
            const src = thumbnail.getAttribute("data-video-src");
            modalVideo.querySelector("source").src = src;
            modalVideo.load();
            modal.style.display = "flex";
        });
    });

    closeBtn.addEventListener("click", () => {
        modalVideo.pause();
        modal.style.display = "none";
    });

    modal.addEventListener("click", e => {
        if (e.target === modal) {
            modalVideo.pause();
            modal.style.display = "none";
        }
    });
});