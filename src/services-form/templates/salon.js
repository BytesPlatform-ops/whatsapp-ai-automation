const { pageShell, escapeHtml } = require('./common');

function renderSalonForm({ token, businessName }) {
  const title = businessName
    ? `Add ${escapeHtml(businessName)}'s services`
    : 'Add your salon services';

  const body = `
<div class="hero">
  <span class="badge">Salon services · setup</span>
  <h1>${title}</h1>
  <p class="sub">Add each service with how long it takes and what it costs. A photo is optional — if you skip it we'll auto-pick a stock photo for you.</p>
</div>

<form id="services-form" method="POST" action="/services-form/${escapeHtml(token)}" enctype="multipart/form-data">
  <div id="rows"></div>
  <button type="button" class="add-btn" id="add-btn">+ Add another service</button>

  <div class="submit-row">
    <label class="consent">
      <input type="checkbox" name="consent_given" value="yes" required>
      <span>I agree to the <a href="/privacy" target="_blank" rel="noopener">privacy policy</a> and consent to my data being processed for this website.</span>
    </label>
    <button type="submit" class="submit-btn" id="submit-btn">Save services</button>
    <div class="err" id="err" hidden></div>
  </div>
</form>

<template id="row-tpl">
  <div class="card">
    <span class="row-num"></span>
    <button type="button" class="remove" title="Remove this service" aria-label="Remove">&times;</button>
    <label>Service name</label>
    <input type="text" name="services[__I__][name]" placeholder="e.g. Haircut, Balayage" required maxlength="80">
    <div class="grid-2">
      <div>
        <label>Duration (minutes)</label>
        <input type="number" name="services[__I__][durationMinutes]" min="5" max="480" step="5" placeholder="30" required>
      </div>
      <div>
        <label>Price</label>
        <input type="text" name="services[__I__][priceText]" placeholder="$45" required maxlength="20">
      </div>
    </div>
    <div>
      <label>Photo (optional)</label>
      <div class="photo-row">
        <label class="photo-label">
          <input type="file" name="services[__I__][photo]" accept="image/png,image/jpeg,image/webp">
          📎 Choose photo
        </label>
        <span class="photo-name"></span>
      </div>
    </div>
  </div>
</template>

<script>
(function(){
  var rows = document.getElementById('rows');
  var tpl = document.getElementById('row-tpl');
  var addBtn = document.getElementById('add-btn');
  var maxRows = 30;
  var counter = 0;

  function renumber(){
    var cards = rows.querySelectorAll('.card');
    cards.forEach(function(card, i){
      card.querySelector('.row-num').textContent = '#' + (i+1);
    });
    addBtn.disabled = cards.length >= maxRows;
  }

  function addRow(){
    if (rows.children.length >= maxRows) return;
    var idx = counter++;
    var html = tpl.innerHTML.replace(/__I__/g, String(idx));
    var holder = document.createElement('div');
    holder.innerHTML = html;
    var card = holder.firstElementChild;
    rows.appendChild(card);
    card.querySelector('.remove').addEventListener('click', function(){
      if (rows.children.length === 1) return;
      card.remove();
      renumber();
    });
    var fileInput = card.querySelector('input[type=file]');
    var nameSpan = card.querySelector('.photo-name');
    fileInput.addEventListener('change', function(){
      nameSpan.textContent = fileInput.files && fileInput.files[0] ? fileInput.files[0].name : '';
    });
    renumber();
  }

  addBtn.addEventListener('click', addRow);
  addRow();

  var form = document.getElementById('services-form');
  var errEl = document.getElementById('err');
  var submitBtn = document.getElementById('submit-btn');
  form.addEventListener('submit', function(e){
    if (rows.children.length === 0) {
      e.preventDefault();
      errEl.textContent = 'Add at least one service.';
      errEl.hidden = false;
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  });
})();
</script>
`;
  return pageShell({ title, body });
}

module.exports = { renderSalonForm };
