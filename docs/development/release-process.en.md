# Release Process

Version release workflow for Codex Pro.

---

## Versioning

Codex Pro uses [SemVer](https://semver.org/). Currently in Beta (0.x.y).

## Steps

### 1. Prepare

- [ ] All CI checks pass
- [ ] Update `CHANGELOG.md`
- [ ] Bump version in `pyproject.toml`
- [ ] Verify docs match code

### 2. Build

```bash
cd web && pnpm install --frozen-lockfile && pnpm build && cd ..
test -f web/dist/index.html
hatch build
```

### 3. Verify

```bash
python -m venv /tmp/smoke
/tmp/smoke/bin/pip install dist/*.whl
/tmp/smoke/bin/codex-pro --version
```

### 4. Publish

```bash
hatch publish
```

### 5. Tag

```bash
git tag v0.1.x
git push origin v0.1.x
```

## Automation

`scripts/publish.sh` wraps steps 2-4.

## Checklist

- [ ] Codex Pro built and included in wheel
- [ ] `codex_pro/_bundled/web/index.html` in artifact
- [ ] `codex-pro --help` works after install
- [ ] Correct version
- [ ] CHANGELOG updated
- [ ] Git tag created
