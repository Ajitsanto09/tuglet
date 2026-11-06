document.getElementById('pagebtn').addEventListener('click', () => { document.body.dataset.clicked = 'yes'; });
window.addEventListener('keydown', (e) => { document.body.dataset.lastKey = e.key; });
