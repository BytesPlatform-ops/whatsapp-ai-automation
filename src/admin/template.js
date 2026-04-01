const path = require('path');

const DASHBOARD_PATH = path.join(__dirname, 'dashboard.html');

/**
 * Login page HTML.
 */
function getLoginHTML(error) {
  const errorHTML = error
    ? '<div class="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">' + error + '</div>'
    : '';

  return '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>Admin Login</title>' +
'  <script src="https://cdn.tailwindcss.com"><\/script>' +
'  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">' +
'  <style>* { font-family: \'Inter\', sans-serif; }</style>' +
'</head>' +
'<body class="bg-gray-50 min-h-screen flex items-center justify-center">' +
'  <div class="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">' +
'    <div class="text-center mb-6">' +
'      <div class="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mx-auto mb-4">' +
'        <svg class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>' +
'      </div>' +
'      <h1 class="text-xl font-bold">Admin Login</h1>' +
'      <p class="text-sm text-gray-500 mt-1">WhatsApp Bot Dashboard</p>' +
'    </div>' +
     errorHTML +
'    <form method="POST" action="/admin/login">' +
'      <input type="password" name="password" placeholder="Enter admin password" required autofocus' +
'        class="w-full px-4 py-3 border rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">' +
'      <button type="submit" class="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors">' +
'        Sign In' +
'      </button>' +
'    </form>' +
'  </div>' +
'</body>' +
'</html>';
}

module.exports = { DASHBOARD_PATH, getLoginHTML };
