#!/usr/bin/env python3
"""Explicit same-ID Unity release update. Default verifies only; never starts/aborts sessions."""
import argparse
import hashlib
import http.cookiejar
import json
import pathlib
import re
import stat
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse


def require(ok, message):
    if not ok:
        raise SystemExit(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('credentials', 'base-url', 'catalog', 'game-id', 'patient-id', 'evidence-dir'):
        parser.add_argument('--' + key, required=True)
    parser.add_argument('--backup-file')
    parser.add_argument('--backup-sha256')
    parser.add_argument('--expected-version', default='0.1.2')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    origin = urlparse(base)
    require(origin.scheme == 'https' and origin.netloc and not any((origin.username, origin.password, origin.path, origin.query, origin.fragment)), 'Exact HTTPS origin required')
    path = pathlib.Path(args.credentials)
    require(path.is_file() and not path.is_symlink() and stat.S_IMODE(path.stat().st_mode) == 0o600, 'Credentials require regular 0600 file')
    credentials = json.loads(path.read_text())
    require(credentials['patient']['profileId'] == args.patient_id, 'Dedicated patient identity mismatch')
    catalog = json.loads(pathlib.Path(args.catalog).read_text())
    for entry in catalog['provenance']:
        require(hashlib.sha256(pathlib.Path(entry['path']).read_bytes()).hexdigest() == entry['sha256'], 'Catalog source drift')
    games = [g for g in catalog['games'] if g['create']['code'] == 'rhythm_reach_3d']
    require(len(games) == 1, 'Exactly one Unity game required')
    payload = games[0]['publish']
    require(payload['gameVersion'] == '0.1.3' and payload['bridgeProtocolVersion'] == '1.0.0', 'Unexpected release contract')
    report = {'mode': 'apply' if args.apply else 'dry-run', 'gameId': args.game_id, 'events': [], 'payload': payload, 'sessionMutations': 0, 'resultSubmissions': 0}
    output = pathlib.Path(args.evidence_dir)
    output.mkdir(parents=True, exist_ok=True)

    def save():
        (output / ('unity-upgrade-apply.json' if args.apply else 'unity-upgrade-dry-run.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    csrf = None

    def request(route, body=None, method=None, expected=200, client=None, csrf_token=None):
        headers = {'Origin': base}
        if body is not None:
            headers.update({'Content-Type': 'application/json', 'x-csrf-token': csrf_token if csrf_token is not None else (csrf or '')})
        req = urllib.request.Request(base + route, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
        try:
            with (client if client is not None else opener).open(req, timeout=30) as response:
                status, data = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, data = error.code, error.read()
        report['events'].append({'path': route, 'http': status})
        save()
        require(status == expected, 'Unexpected HTTP status on ' + route + ': ' + str(status))
        return json.loads(data) if data else None

    # All immutable assets must be publicly deployed and match source manifest before publication.
    manifest_path = '/unity/rhythm_reach_3d/0.1.3/manifest.json'
    require(payload['manifestUrl'] == manifest_path and payload['buildBaseUrl'] == manifest_path.rsplit('/', 1)[0], 'Unexpected immutable asset path')
    manifest = request(manifest_path)
    local_manifests = [entry for entry in catalog['provenance'] if entry['path'].endswith('/unity/rhythm_reach_3d/0.1.3/manifest.json')]
    require(len(local_manifests) == 1 and manifest == json.loads(pathlib.Path(local_manifests[0]['path']).read_text()), 'Deployed manifest differs from verified source')
    require(manifest['gameVersion'] == '0.1.3' and manifest['bridgeProtocolVersion'] == '1.0.0' and manifest['unityVersion'] == '6000.0.75f1', 'Deployed manifest contract mismatch')
    require(len(manifest['artifacts']) == 4, 'Expected four immutable artifacts')
    report['verifiedArtifacts'] = []
    for asset in manifest['artifacts']:
        require(asset['url'].startswith(payload['buildBaseUrl'] + '/Build/') and '..' not in asset['url'], 'Invalid artifact URL')
        with urllib.request.urlopen(base + asset['url'], timeout=60) as response:
            require(response.geturl().startswith(base + '/'), 'Artifact redirected outside origin')
            data = response.read()
        digest = hashlib.sha256(data).hexdigest()
        require(len(data) == asset['sizeBytes'] and asset['sha256'] == 'sha256:' + digest, 'Deployed artifact hash or size mismatch')
        report['verifiedArtifacts'].append({'path': asset['path'], 'sha256': digest, 'sizeBytes': len(data)})
    csrf = request('/auth/csrf')['csrfToken']
    request('/auth/login', {key: credentials['administrator'][key] for key in ('account', 'password')}, expected=201)
    rows = request('/admin/game-contents')
    matches = [g for g in rows if g['id'] == args.game_id and g['code'] == 'rhythm_reach_3d']
    require(len(matches) == 1, 'Exact existing Unity game identity required')
    game = matches[0]
    require(game['runtimeType'] == 'unity_webgl', 'Unexpected runtime')
    for key, value in payload.items():
        if key not in ('manifestUrl', 'buildBaseUrl', 'gameVersion'):
            require(game.get(key) == value, 'Non-version contract drift: ' + key)
    report['before'] = {k: game[k] for k in ('id', 'code', 'gameVersion', 'manifestUrl', 'buildBaseUrl')}
    # Patient-scoped full records endpoint has no take/limit; admin is not permitted
    # by assertPatientAccess. Keep independent cookies; never revoke either login.
    patient_client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    patient_csrf = request('/auth/csrf', client=patient_client)['csrfToken']
    request('/auth/login', {key: credentials['patient'][key] for key in ('account', 'password')},
            expected=201, client=patient_client, csrf_token=patient_csrf)
    records = request('/patients/' + args.patient_id + '/training-records', client=patient_client)
    require(isinstance(records.get('sessions'), list), 'Complete training records response required')
    require(records['summary']['totalSessions'] == len(records['sessions']), 'Incomplete training records response')
    report['activeSessionCheck'] = {'source': 'patient-training-records-unpaginated', 'totalSessions': len(records['sessions'])}
    for session in records['sessions']:
        require('sessionStatus' in session and isinstance(session.get('gameContent'), dict) and 'id' in session['gameContent'], 'Session identity/status missing')
    report['activeSessions'] = [{'id': row['id'], 'status': row['sessionStatus'], 'gameContentId': row['gameContent']['id']}
                                for row in records['sessions'] if row['sessionStatus'] in ('started', 'in_progress')]
    report['nextPlanBlockedByActiveSession'] = bool(report['activeSessions'])
    require(not any(s['gameContentId'] == args.game_id for s in report['activeSessions']), 'Active Unity session must remain untouched; do not upgrade now')
    if game['gameVersion'] == '0.1.3':
        require(all(game.get(k) == v for k, v in payload.items()), 'Existing target version conflict')
        report['result'] = 'already-identical-no-write'
    else:
        require(game['gameVersion'] == args.expected_version, 'Unexpected source version; no overwrite')
        report['result'] = 'would-upgrade-same-id'
        if args.apply:
            require(args.backup_file and args.backup_sha256 and re.fullmatch('[a-f0-9]{64}', args.backup_sha256), 'Fresh backup file and SHA256 required')
            backup = pathlib.Path(args.backup_file)
            require(backup.is_file() and not backup.is_symlink() and 0 <= time.time() - backup.stat().st_mtime <= 3600, 'Backup must be regular and fresh within one hour')
            require(hashlib.sha256(backup.read_bytes()).hexdigest() == args.backup_sha256, 'Backup SHA mismatch')
            report['backupSha256'] = args.backup_sha256
            save()
            updated = request('/admin/game-contents/' + args.game_id + '/unity-build', payload, method='PATCH')
            require(updated['id'] == args.game_id and all(updated.get(k) == v for k, v in payload.items()), 'Published contract mismatch')
            logs = request('/admin/audit-logs?targetId=' + args.game_id + '&take=10')
            require(any(row['action'] == 'game_content.publish_unity_build' and row['metadata'].get('gameVersion') == '0.1.3' for row in logs), 'Versioned publication audit requires verification')
            report['auditActions'] = [row['action'] for row in logs]
            report['result'] = 'upgraded-same-id'
    save()
    print(json.dumps({'mode': report['mode'], 'result': report['result'], 'nextPlanBlockedByActiveSession': report['nextPlanBlockedByActiveSession']}))


if __name__ == '__main__':
    main()
