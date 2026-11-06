for (const a of document.querySelectorAll('nav a')) a.addEventListener('click', (e) => {
  e.preventDefault();
  history.pushState({}, '', a.href);
  document.getElementById('h').textContent = a.textContent;
  document.body.replaceChildren(...document.body.children); // framework-style re-render of body
});
