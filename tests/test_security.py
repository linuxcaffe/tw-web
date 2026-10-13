"""
Phase 1 security invariants (see tw:docs/tw-web-dev-infra-plan.md, security review).

S1  /ws/pty refuses a WebSocket handshake from a foreign Origin.
S2  The server binds to localhost (plus Tailscale when asked), never 0.0.0.0 by default.
S3  The Werkzeug debugger is off unless explicitly asked for, and refused
    whenever the server is reachable beyond localhost.
S4  Requests with a Host header outside the allowlist get 400 (DNS rebinding).
S5  State-changing requests from a foreign Origin get 403. Requests with no
    Origin (curl, scripts, the native host) are not browser attacks and pass.
"""
import pytest

LOCAL = {'Host': 'localhost:5000'}
EVIL = 'https://evil.example'
WS_UPGRADE = {
    'Upgrade': 'websocket',
    'Connection': 'Upgrade',
    'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version': '13',
}


# ── S4: Host allowlist ────────────────────────────────────────────────────────

@pytest.mark.parametrize('host', ['localhost:5000', '127.0.0.1:5000', 'localhost', '[::1]:5000'])
def test_local_hosts_allowed(client, host):
    assert client.get('/manifest.json', headers={'Host': host}).status_code == 200


@pytest.mark.parametrize('host', ['attacker.example', 'attacker.example:5000', '192.168.1.50:5000'])
def test_foreign_host_rejected(client, host):
    assert client.get('/manifest.json', headers={'Host': host}).status_code == 400


def test_extra_allowed_hosts(app_module):
    hosts = app_module._allowed_hosts({'TW_WEB_ALLOWED_HOSTS': 'phone.example, other'}, None)
    assert {'phone.example', 'other', 'localhost'} <= hosts


def test_tailscale_names_allowed(app_module):
    ts = {'ips': ['100.99.171.77', 'fd7a:115c:a1e0::4932:ab4d'],
          'names': ['yoga', 'yoga.tail00b6cd.ts.net']}
    hosts = app_module._allowed_hosts({}, ts)
    assert {'100.99.171.77', 'fd7a:115c:a1e0::4932:ab4d', 'yoga', 'yoga.tail00b6cd.ts.net'} <= hosts


# ── S5: Origin check on state-changing requests ──────────────────────────────

def test_cross_origin_post_rejected(client):
    r = client.post('/api/debug', headers={**LOCAL, 'Origin': EVIL}, json={'msg': 'x'})
    assert r.status_code == 403


def test_cross_origin_bodyless_post_rejected(client):
    # the drive-by case: a no-cors POST with no body
    r = client.post('/api/task/1/done', headers={**LOCAL, 'Origin': EVIL})
    assert r.status_code == 403


def test_null_origin_rejected(client):
    r = client.post('/api/debug', headers={**LOCAL, 'Origin': 'null'}, json={'msg': 'x'})
    assert r.status_code == 403


@pytest.mark.parametrize('origin', [None, 'http://localhost:5000', 'moz-extension://0d1e2f'])
def test_trusted_or_absent_origin_allowed(client, origin):
    headers = dict(LOCAL)
    if origin:
        headers['Origin'] = origin
    assert client.post('/api/debug', headers=headers, json={'msg': 'x'}).status_code == 200


def test_get_not_origin_checked(client):
    # reads are protected by CORS + the Host check, not by Origin
    assert client.get('/manifest.json', headers={**LOCAL, 'Origin': EVIL}).status_code == 200


# ── S1: WebSocket origin ──────────────────────────────────────────────────────

def test_ws_foreign_origin_rejected(client):
    r = client.get('/ws/pty', headers={**LOCAL, **WS_UPGRADE, 'Origin': EVIL})
    assert r.status_code == 403


def test_ws_origin_rules(app_module):
    assert app_module._origin_allowed('http://localhost:5000', 'localhost:5000')
    assert app_module._origin_allowed('http://yoga:5000', 'yoga:5000')
    assert not app_module._origin_allowed('http://localhost:5000', 'yoga:5000')
    assert not app_module._origin_allowed(EVIL, 'localhost:5000')


# ── S2 / S3: binding and debugger ─────────────────────────────────────────────

TS = {'ips': ['100.99.171.77', 'fd7a:115c:a1e0::4932:ab4d'], 'names': ['yoga']}


def test_default_binds_localhost_only(app_module):
    opts = app_module._server_options({}, None)
    assert opts['binds'] == ['127.0.0.1']
    assert opts['debug'] is False
    assert opts['use_reloader'] is True


def test_tailscale_adds_tailscale_binds(app_module):
    opts = app_module._server_options({'TW_WEB_TAILSCALE': '1'}, TS)
    assert opts['binds'] == ['127.0.0.1', '100.99.171.77', 'fd7a:115c:a1e0::4932:ab4d']


def test_debug_allowed_on_localhost_only(app_module):
    assert app_module._server_options({'TW_WEB_DEBUG': '1'}, None)['debug'] is True


def test_debug_refused_with_tailscale(app_module):
    opts = app_module._server_options({'TW_WEB_DEBUG': '1', 'TW_WEB_TAILSCALE': '1'}, TS)
    assert opts['debug'] is False


def test_debug_refused_with_wildcard(app_module):
    opts = app_module._server_options({'TW_WEB_DEBUG': '1', 'TW_WEB_HOST': '0.0.0.0'}, None)
    assert opts['debug'] is False
