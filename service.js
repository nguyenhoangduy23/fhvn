'use strict';
// Runs inside TizenBrew on the TV (Node service with TizenBrew's tizen API).
// The home page itself has no tizen API, so this helper on 127.0.0.1:47812 provides:
//   /apps            installed apps (JSON)
//   /launch?id=...   open an app
//   /icon?path=...   an app's own icon file
// It only listens on the TV itself.

var http = require('http');
var fs = require('fs');
var url = require('url');

var TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif' };

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(body);
}

function listApps(res) {
  try {
    tizen.application.getAppsInfo(function (list) {
      var seen = {}, out = [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (!a || !a.show || !a.name || seen[a.id]) continue;
        if (/homescreen|launcher/i.test(a.id)) continue;
        seen[a.id] = 1;
        out.push({ id: a.id, name: a.name, icon: a.iconPath || '' });
      }
      out.sort(function (x, y) { return x.name.localeCompare(y.name); });
      send(res, 200, 'application/json; charset=utf-8', JSON.stringify(out));
    }, function (e) {
      send(res, 500, 'text/plain', 'getAppsInfo failed: ' + (e && e.message));
    });
  } catch (e) {
    send(res, 500, 'text/plain', 'no tizen api: ' + e.message);
  }
}

function launchApp(id, res) {
  var done = false;
  function ok() { if (!done) { done = true; send(res, 200, 'text/plain', 'ok'); } }
  function fail(e) { if (!done) { done = true; send(res, 500, 'text/plain', 'launch failed: ' + (e && e.message)); } }
  try {
    tizen.application.launch(id, ok, function () {
      try {
        var c = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default');
        tizen.application.launchAppControl(c, id, ok, fail);
      } catch (e) { fail(e); }
    });
  } catch (e) { fail(e); }
}

var server = http.createServer(function (req, res) {
  var u = url.parse(req.url, true);
  if (u.pathname === '/ping') { send(res, 200, 'text/plain', 'ok'); return; }
  if (u.pathname === '/apps') { listApps(res); return; }
  if (u.pathname === '/launch') {
    var id = String(u.query.id || '');
    if (!/^[A-Za-z0-9._-]+$/.test(id)) { send(res, 400, 'text/plain', 'bad id'); return; }
    launchApp(id, res);
    return;
  }
  if (u.pathname !== '/icon') { send(res, 404, 'text/plain', ''); return; }

  var p = String(u.query.path || '').replace(/^file:\/\//, '');
  var ext = (p.split('.').pop() || '').toLowerCase();
  if (p.charAt(0) !== '/' || p.indexOf('..') >= 0 || !TYPES[ext]) { send(res, 400, 'text/plain', ''); return; }
  fs.readFile(p, function (err, data) {
    if (err) { send(res, 404, 'text/plain', ''); return; }
    res.writeHead(200, { 'Content-Type': TYPES[ext], 'Cache-Control': 'max-age=604800', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
});

server.on('error', function () { /* already running (port in use) - nothing to do */ });
server.listen(47812, '127.0.0.1');
