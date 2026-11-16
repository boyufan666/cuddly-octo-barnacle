import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('upgrade', pathlib.Path(__file__).parents[1] / 'upgrade-unity-game-release.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Response:
    status = 200
    def __init__(self, value, status=200):
        self.value, self.status = value, status
    def read(self):
        return json.dumps(self.value).encode()
    def __enter__(self):
        return self
    def __exit__(self, *_):
        pass


class UpgradeChecks(unittest.TestCase):
    def probe(self, sessions, count=None):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            manifest_path = root / 'unity/rhythm_reach_3d/0.1.3/manifest.json'
            manifest_path.parent.mkdir(parents=True)
            manifest = {'gameVersion': '0.1.3', 'bridgeProtocolVersion': '1.0.0', 'unityVersion': '6000.0.75f1',
                        'artifacts': [{'url': '/unity/rhythm_reach_3d/0.1.3/Build/' + str(i), 'path': str(i),
                                       'sha256': 'sha256:' + MODULE.hashlib.sha256(b'asset').hexdigest(), 'sizeBytes': 5} for i in range(4)]}
            manifest_path.write_text(json.dumps(manifest))
            payload = {'gameVersion': '0.1.3', 'bridgeProtocolVersion': '1.0.0', 'manifestUrl': '/unity/rhythm_reach_3d/0.1.3/manifest.json', 'buildBaseUrl': '/unity/rhythm_reach_3d/0.1.3'}
            catalog = {'provenance': [{'path': str(manifest_path), 'sha256': MODULE.hashlib.sha256(manifest_path.read_bytes()).hexdigest()}],
                       'games': [{'create': {'code': 'rhythm_reach_3d'}, 'publish': payload}]}
            (root / 'catalog.json').write_text(json.dumps(catalog))
            (root / 'credentials.json').write_text(json.dumps({'administrator': {'account': 'admin', 'password': 'synthetic'}, 'patient': {'account': 'patient', 'password': 'synthetic', 'profileId': 'patient'}}))
            os.chmod(root / 'credentials.json', 0o600)
            calls = []
            class Client:
                def __init__(self, role):
                    self.role = role
                def open(self, request, **_):
                    route = MODULE.urlparse(request.full_url).path
                    calls.append((self.role, route, request.get_method()))
                    if route.endswith('manifest.json'): return Response(manifest)
                    if route == '/auth/csrf': return Response({'csrfToken': 'synthetic'})
                    if route == '/auth/login': return Response({}, 201)
                    if route == '/admin/game-contents': return Response([{**payload, 'gameVersion': '0.1.2', 'id': 'unity', 'code': 'rhythm_reach_3d', 'runtimeType': 'unity_webgl'}])
                    if route == '/patients/patient/training-records':
                        self_test.assertEqual(self.role, 'patient')
                        return Response({'sessions': sessions, 'summary': {'totalSessions': len(sessions) if count is None else count}})
                    raise AssertionError('Unexpected route: ' + route)
            class Asset(Response):
                def read(self): return b'asset'
                def geturl(self): return 'https://example.test/asset'
            self_test = self
            clients = iter([Client('admin'), Client('patient')])
            argv = ['upgrade', '--credentials', str(root / 'credentials.json'), '--catalog', str(root / 'catalog.json'), '--game-id', 'unity', '--patient-id', 'patient', '--base-url', 'https://example.test', '--evidence-dir', str(root / 'evidence')]
            with patch('sys.argv', argv), patch.object(MODULE.urllib.request, 'build_opener', side_effect=lambda *_: next(clients)), patch.object(MODULE.urllib.request, 'urlopen', side_effect=lambda *_args, **_kwargs: Asset(None)):
                with self.assertRaises(SystemExit) as error:
                    MODULE.main()
            self.assertFalse(any(method == 'PATCH' or route.endswith('/logout') for _, route, method in calls))
            self.assertFalse(any(route == '/patients/patient' for _, route, _ in calls))
            return str(error.exception)

    def test_sixth_session_active_unity_is_not_hidden_by_profile_take_five(self):
        sessions = [{'id': str(i), 'sessionStatus': 'completed', 'gameContent': {'id': 'other'}} for i in range(5)]
        sessions.append({'id': 'old-active-unity', 'sessionStatus': 'in_progress', 'gameContent': {'id': 'unity'}})
        self.assertIn('Active Unity session', self.probe(sessions))

    def test_incomplete_response_fails_before_mutation(self):
        self.assertIn('Incomplete training records', self.probe([], count=6))


if __name__ == '__main__':
    unittest.main()
