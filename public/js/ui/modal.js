export function createModal(dom){
  function open(title, html){
    dom.modalTitle.textContent = title;
    dom.modalBody.innerHTML = html;
    dom.modalBackdrop.style.display = "block";
    dom.modal.style.display = "block";
  }
  function close(){
    dom.modalBackdrop.style.display = "none";
    dom.modal.style.display = "none";
  }
  dom.btnClose.onclick = close;
  dom.modalBackdrop.onclick = close;

  return { open, close };
}
