export async function init() {
	miro.board.ui.on('icon:click', async () => {
		console.log('[ring] icon:click -> openPanel app.html');
		await miro.board.ui.openPanel({ url: 'app.html' });
	});
}

init(); 
