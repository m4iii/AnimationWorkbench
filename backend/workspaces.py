"""One replaceable cache plus portable, explicitly saved named workspaces."""
import hashlib
import json
import re
import shutil
import threading
from pathlib import Path


class Workspaces:
    def __init__(self, store, error, write_json):
        self.store, self.error, self.write_json = store, error, write_json
        self.lock = threading.RLock()
        self.root = store.root / "workspaces"
        self.root.mkdir(exist_ok=True)
        self.cache = store.root / 'workspace-cache.json'

    def validate(self, snapshot):
        if not isinstance(snapshot, dict) or snapshot.get('schemaVersion') != 1:
            raise self.error('Unsupported workspace format')
        if not isinstance(snapshot.get('config'), dict) or not isinstance(snapshot.get('motion'), dict):
            raise self.error('Workspace config and motion are required')
        identities = set()
        def walk(value):
            if isinstance(value, dict):
                for key, val in value.items():
                    if key in ('assetId', 'thumbnailAssetId') and val is not None:
                        if not isinstance(val, str) or not re.fullmatch('[a-f0-9]{64}', val):
                            raise self.error('Invalid workspace asset ID')
                        identities.add(val)
                    else:
                        walk(val)
            elif isinstance(value, list):
                for val in value:
                    walk(val)
        walk(snapshot)
        return identities

    def read_cache(self):
        with self.lock:
            return json.loads(self.cache.read_text(encoding='utf-8')) if self.cache.exists() else {'revision': 0, 'snapshot': None}

    def save_cache(self, body):
        snapshot = body.get('snapshot')
        for identity in self.validate(snapshot):
            self.store.path('assets', identity)
        with self.lock:
            current = self.read_cache()
            if body.get('revision') != current['revision']:
                raise self.error('缓存已被另一个窗口更新，请刷新后继续。', 409)
            record = {'revision': current['revision']+1, 'snapshot': snapshot}
            self.write_json(self.cache, record)
            return {'revision': record['revision']}

    def named_path(self, name):
        if not isinstance(name, str) or not name.strip() or len(name) > 80 or re.search(r'[<>:"/\\|?*\x00-\x1f]', name) or name.endswith(('.', ' ')) or name in ('.', '..'):
            raise self.error('工作区名称无效')
        if re.fullmatch(r'(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?', name):
            raise self.error('工作区名称为系统保留名称')
        target = self.root / (name + '.awb')
        if target.is_symlink() or target.resolve().parent != self.root.resolve():
            raise self.error('Invalid workspace path')
        return target

    def list_named(self):
        items = []
        with self.lock:
            for folder in self.root.glob('*.awb'):
                manifest = folder / 'workspace.json'
                if folder.is_symlink() or manifest.is_symlink() or not manifest.is_file():
                    continue
                items.append({'name': folder.name[:-4], 'modifiedAt': manifest.stat().st_mtime})
        return {'directory': str(self.root), 'workspaces': sorted(items, key=lambda x: x['modifiedAt'], reverse=True)}

    def save_named(self, body):
        name = body.get('name', '')
        target = self.named_path(name)
        with self.lock:
            cached = self.read_cache()
            if body.get('revision') != cached['revision']:
                raise self.error('缓存已变化，请重试保存', 409)
            snapshot = cached['snapshot']
            if snapshot is None:
                raise self.error('当前缓存为空')
        identities = self.validate(snapshot)
        sources = {i: self.store.path('assets', i) for i in identities}
        with self.lock:
            manifest = target / 'workspace.json'
            if target.exists() and not manifest.is_file():
                raise self.error('目标文件夹不是已保存的工作区，不会覆盖', 409)
            if manifest.exists():
                if manifest.is_symlink():
                    raise self.error('Invalid manifest')
                self.validate(json.loads(manifest.read_text(encoding='utf-8')))
            target.mkdir(exist_ok=True)
            assets = target / 'assets'
            if assets.is_symlink():
                raise self.error('Invalid assets directory')
            assets.mkdir(exist_ok=True)
            for identity, source in sources.items():
                dest = assets / identity
                if dest.is_symlink():
                    raise self.error('Invalid asset destination')
                if not dest.exists():
                    temp = assets / (identity + '.tmp')
                    shutil.copyfile(source, temp)
                    temp.replace(dest)
            saved = {**snapshot, 'name': name, 'config': {**snapshot['config'], 'project': name}}
            self.write_json(manifest, saved)
            return {'name': name, 'directory': str(target)}

    def open_named(self, body):
        with self.lock:
            directory = self.named_path(body.get('name', ''))
            manifest = directory / 'workspace.json'
            if not manifest.is_file() or manifest.is_symlink() or manifest.stat().st_size > 16*1024**2:
                raise self.error('请选择保存的 .awb 工作区文件夹')
            snapshot = json.loads(manifest.read_text(encoding='utf-8'))
            identities = self.validate(snapshot)
            checked = []
            for identity in identities:
                path = directory / 'assets' / identity
                if path.resolve().parent != (directory / 'assets').resolve() or path.is_symlink() or (directory / 'assets').is_symlink():
                    raise self.error('Invalid asset path')
                if not path.is_file():
                    raise self.error('工作区缺少素材：' + identity)
                with path.open('rb') as stream:
                    if hashlib.file_digest(stream, 'sha256').hexdigest() != identity:
                        raise self.error('工作区素材校验失败：' + identity)
                checked.append((identity, path))
            for identity, path in checked:
                dest = self.store.root / 'assets' / identity
                if not dest.exists():
                    shutil.copyfile(path, dest)
            return {'snapshot': snapshot}
