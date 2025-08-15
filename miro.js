async function init() {
	// Не инициализируем SDK, если страница открыта напрямую, а не внутри Miro
	if (window.top === window.self) {
		console.warn("[ring] This page must run inside Miro. Open it from the Miro app icon.");
		return;
	}

	miro.onReady(() => {
		console.log("[ring] Miro SDK ready");
		const uiUrl = new URL("index.html", window.location.href).toString();
		miro.board.ui.on("icon:click", async () => {
			console.log("[ring] icon:click fired");
			try {
				const sticky = await miro.board.createStickyNote({
					content: "Ring: тестовая карточка",
					x: 0,
					y: 0
				});
				console.log("[ring] sticky created", sticky);
				await miro.board.viewport.zoomTo(sticky);
				return;
			} catch (error) {
				console.error("[ring] createStickyNote failed", error);
			}

			try {
				await miro.board.ui.openPanel({ url: uiUrl });
				console.log("[ring] openPanel shown", uiUrl);
				return;
			} catch (error) {
				console.error("[ring] openPanel failed", error);
			}

			if (await miro.board.ui.canOpenModal()) {
				await miro.board.ui.openModal({
					url: uiUrl,
					width: 920,
					height: 680,
					fullscreen: true
				});
				console.log("[ring] modal opened as fallback", uiUrl);
			}
		});
	});
}

init(); 