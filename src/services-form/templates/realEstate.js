const { pageShell, escapeHtml, buildCurrencyDropdown, CURRENCY_DROPDOWN_JS } = require('./common');

function renderRealEstateForm({ token, businessName }) {
  const title = businessName
    ? `Add ${escapeHtml(businessName)}'s listings`
    : 'Add your featured listings';

  const body = `
<div class="hero">
  <span class="badge">Featured listings · setup</span>
  <h1>${title}</h1>
  <p class="sub">Add up to 3 listings to feature on your homepage. A photo is optional — if you skip it we'll use a professional stock photo.</p>
</div>

<form id="services-form" method="POST" action="/services-form/${escapeHtml(token)}" enctype="multipart/form-data">
  <div class="field-group" style="margin-bottom:1.5rem">
    <label for="currency">Currency</label>
    ${buildCurrencyDropdown('currency')}
  </div>
  <div id="rows"></div>
  <button type="button" class="add-btn" id="add-btn">+ Add another listing</button>

  <div class="submit-row">
    <label class="consent">
      <input type="checkbox" name="consent_given" value="yes" required>
      <span>I agree to the <a href="/privacy" target="_blank" rel="noopener">privacy policy</a> and consent to my data being processed for this website.</span>
    </label>
    <button type="submit" class="submit-btn" id="submit-btn">Save listings</button>
    <div class="err" id="err" hidden></div>
  </div>
</form>

<template id="row-tpl">
  <div class="card">
    <span class="row-num"></span>
    <button type="button" class="remove" title="Remove this listing" aria-label="Remove">&times;</button>
    <label>Address</label>
    <input type="text" name="listings[__I__][address]" placeholder="45 Elm St" required maxlength="120">
    <div class="grid-2">
      <div>
        <label>Price (<span class="price-sym">$</span>)</label>
        <input type="number" name="listings[__I__][price]" min="0" step="1000" placeholder="525000" required>
      </div>
      <div>
        <label>Status</label>
        <select name="listings[__I__][status]" required>
          <option value="For Sale">For Sale</option>
          <option value="Just Listed">Just Listed</option>
          <option value="Pending">Pending</option>
          <option value="Sold">Sold</option>
        </select>
      </div>
    </div>
    <div class="grid-3">
      <div>
        <label>Beds</label>
        <input type="number" name="listings[__I__][beds]" min="0" max="20" placeholder="3" required>
      </div>
      <div>
        <label>Baths</label>
        <input type="number" name="listings[__I__][baths]" min="0" max="20" step="0.5" placeholder="2" required>
      </div>
      <div>
        <label>Sqft</label>
        <input type="number" name="listings[__I__][sqft]" min="0" step="50" placeholder="1800" required>
      </div>
    </div>
    <label>Neighborhood (optional)</label>
    <input type="text" name="listings[__I__][neighborhood]" placeholder="Westlake" maxlength="60">
    <div>
      <label>Photo (optional)</label>
      <div class="photo-row">
        <label class="photo-label">
          <input type="file" name="listings[__I__][photo]" accept="image/png,image/jpeg,image/webp">
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
  var maxRows = 3;
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

  document.addEventListener('currency-change', function(e){
    var sym = e.detail.sym || e.detail.code;
    document.querySelectorAll('.price-sym').forEach(function(el){ el.textContent = sym; });
  });
${CURRENCY_DROPDOWN_JS}

  var form = document.getElementById('services-form');
  var errEl = document.getElementById('err');
  var submitBtn = document.getElementById('submit-btn');
  form.addEventListener('submit', function(e){
    if (rows.children.length === 0) {
      e.preventDefault();
      errEl.textContent = 'Add at least one listing.';
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

module.exports = { renderRealEstateForm };
