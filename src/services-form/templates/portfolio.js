const { pageShell, escapeHtml } = require('./common');

// Portfolio "work" form — each row is one project / product the person built:
// name + short description + optional link + optional photo. No price/duration
// (unlike salon) — portfolio templates render project CARDS, not a priced
// service list. Submissions map to websiteData.projects[] (same shape the
// chat-side WEB_COLLECT_PROJECTS_DETAILS flow produces) so the website
// template consumes them unchanged. Max rows match MAX_PROJECTS (6) in webDev.js.
function renderPortfolioForm({ token, businessName }) {
  const title = businessName
    ? `Add ${escapeHtml(businessName)}'s work`
    : 'Add your projects';

  const body = `
<div class="hero">
  <span class="badge">Portfolio · projects</span>
  <h1>${title}</h1>
  <p class="sub">Add each project or product you've built — a name, a short description, an optional link, and a photo. Skip the photo and we'll auto-pick a clean visual for you.</p>
</div>

<form id="projects-form" method="POST" action="/services-form/${escapeHtml(token)}" enctype="multipart/form-data">
  <div id="rows"></div>
  <button type="button" class="add-btn" id="add-btn">+ Add another project</button>

  <div class="submit-row">
    <label class="consent">
      <input type="checkbox" name="consent_given" value="yes" required>
      <span>I agree to the <a href="/privacy" target="_blank" rel="noopener">privacy policy</a> and consent to my data being processed for this website.</span>
    </label>
    <button type="submit" class="submit-btn" id="submit-btn">Save projects</button>
    <div class="err" id="err" hidden></div>
  </div>
</form>

<template id="row-tpl">
  <div class="card">
    <span class="row-num"></span>
    <button type="button" class="remove" title="Remove this project" aria-label="Remove">&times;</button>
    <label>Project name</label>
    <input type="text" name="projects[__I__][name]" placeholder="e.g. BrandX rebrand, Inventory app" required maxlength="80">
    <label>Short description (optional)</label>
    <textarea name="projects[__I__][description]" placeholder="One or two lines on what it is and what you did." maxlength="300"></textarea>
    <label>Link (optional)</label>
    <input type="text" name="projects[__I__][link]" placeholder="github.com/you/brandx or live URL" maxlength="200">
    <div>
      <label>Photo (optional)</label>
      <div class="photo-row">
        <label class="photo-label">
          <input type="file" name="projects[__I__][photo]" accept="image/png,image/jpeg,image/webp">
          📎 Choose photo
        </label>
        <span class="photo-name"></span>
        <button type="button" class="photo-clear" hidden>✕ Remove</button>
      </div>
    </div>
  </div>
</template>

<script>
(function(){
  var rows = document.getElementById('rows');
  var tpl = document.getElementById('row-tpl');
  var addBtn = document.getElementById('add-btn');
  var maxRows = 6;
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
    var clearBtn = card.querySelector('.photo-clear');
    fileInput.addEventListener('change', function(){
      var hasFile = fileInput.files && fileInput.files[0];
      nameSpan.textContent = hasFile ? fileInput.files[0].name : '';
      clearBtn.hidden = !hasFile;
    });
    clearBtn.addEventListener('click', function(){
      fileInput.value = '';
      nameSpan.textContent = '';
      clearBtn.hidden = true;
    });
    renumber();
  }

  addBtn.addEventListener('click', addRow);
  addRow();

  var form = document.getElementById('projects-form');
  var errEl = document.getElementById('err');
  var submitBtn = document.getElementById('submit-btn');
  form.addEventListener('submit', function(e){
    if (rows.children.length === 0) {
      e.preventDefault();
      errEl.textContent = 'Add at least one project.';
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

module.exports = { renderPortfolioForm };
