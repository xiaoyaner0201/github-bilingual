## Summary

First implementation slice proposed in #17952: move **Playground preset** persistence behind a Promise-based domain repository, following the combo repository pattern merged in #8757. The two Playground preset API routes now `await` the repository; the existing synchronous `src/lib/db/playgroundPresets.ts` exports stay as SQLite-only compatibility helpers. Both paths share one SQLite implementation, so no SQL is duplicated.

This is a refactor of the persistence boundary only. No new database driver, backend selection, schema/migration change, authentication change or UI change.

**Status: ready for review; design not yet confirmed.** #17952 asks maintainers to confirm the scope map, the order of implementation slices and how synchronous compatibility should be handled. None of that has been confirmed yet. This PR is marked ready so the full CI runs and it can be reviewed as a concrete example; it is not a claim that the design is accepted. Happy to reshape it, split it differently, or close it if the approach does not fit.

## Related Issues

- Related to #17952 (does not close it; the issue tracks the whole repository extraction)
- Follows the pattern of #8757 / #8261 (#8075)

## Target Branch

- [x] Base is the active `release/v3.8.53` branch (the highest open `release/v*`), not `main`
- Originally implemented on `daca9902e859bc1aa95ba276e3ef200ba7f5d142`. Refreshed by an ordinary merge of `release/v3.8.53` at `8e58decb5c0e3551326de138fb8c4ba2e9c44a29` (no rebase or force-push).
- The only conflicts were the two preset route files, after #18386 moved their authentication into `checkPlaygroundPresetAuth`. Resolution: authentication exactly as on the release branch; only the persistence calls use the repository. Against `8e58decb`, the diff is exactly the 10 files of this PR.

The repository change was verified at `6684869f590f00872af9849f33117a12a1a39503`; `07ec4b8e206903a0fc824d6a72fc63d5421c3fff` only numbered the changelog fragment. Current head `3cb07ae8ff2718d8752a655754e43890ea367091` is the refresh merge, verified and reviewed again (see Refresh below).

## Design

- `src/domain/persistence/playgroundPresetRepository.ts`: record, create/patch input and page types plus `PlaygroundPresetRepository` (`list`, `findById`, `create`, `update`, `deleteById`, all returning Promises). No SQLite types.
- `src/lib/db/repositories/sqlitePlaygroundPresetRepository.ts`: the SQL moved here unchanged as private synchronous functions. They back both the async repository object and an explicit `legacySync` object. The database handle is resolved on every call (`getDbInstance()`), so `resetDbInstance()` never leaves a stale handle.
- `src/lib/db/repositories/playgroundRepositories.ts`: SQLite-only composition root (`presets` + `legacySync`). There is deliberately no backend switch.
- `src/lib/db/playgroundPresets.ts`: keeps every existing export name, signature and synchronous return type; adds `getPlaygroundPresetRepository()` for async callers. `PlaygroundPresetListItem` is now an alias of the domain record (same shape).
- Routes: only the persistence calls changed. Auth (including the existing difference between the collection route, which accepts a dashboard session, and the item route), validation, CORS, status codes and response bodies are unchanged.

Behaviour kept on purpose: newest-first ordering with no new tie-breaker; `offset` ignored without `limit`; `total` is the unpaginated count; unknown id and empty patch do not write; a present `system` key with a nullish value clears to `null`; malformed/non-object stored `params_json` reads as `{}`.

## Validation

- [x] Change type: DB
- [x] Focused tests and category gates from the golden path
- [x] ESLint on every changed TypeScript file and Prettier on all changed files (not full-repository `npm run lint`)
- [x] Production-code changes include new automated tests in this PR

Run on the exact head with lockfile-matched dependencies, isolated data directories and a loopback-only network guard. The node:test runner selects Node 24.13.0; UI and static checks used Node 26.8.2:

- 9 existing related test files, unmodified: **102/102** on the frozen base and on the head (`db-playground-presets`, `update-routes-keep-omitted-fields`, `auto-candidate-overrides-7819` ×2, `playground-schemas`, `integration/playground-presets-crud`, `integration/playground-presets-zod`, `integration/presets-dashboard-auth`, `db/repositories/sqliteComboRepositories`).
- New tests: **15/15** combined; each file also passes alone in a fresh process (7/7, 8/8). UI hook/picker Vitest: **15/15**.
- RED before implementation: the conformance test failed with `ERR_MODULE_NOT_FOUND` (0 pass / 1 fail); the characterization tests passed on the unchanged code before any production edit.
- Gates, all exit 0: `check:db-rules`, `check:migration-numbering`, `check-api-typecheck` (248 baselined, none added), `typecheck:core`, `check:file-size`, `check-complexity-ratchets --base-ref`, `measure-boundary --ratchet --base-ref` (774 = 774), `check:changelog-integrity` (`CHANGELOG_BASE_REF` = frozen base), `check:test-masking` (base SHA), `check:test-discovery`, `check:test-runner-api`, `git diff --check`.
- `check:mutation-test-coverage --strict` fails with an identical list on the frozen base and on this head (unrelated `open-sse` modules). This slice adds nothing to Stryker's mutate list.
- SQLite was exercised through the existing adapter selection. No cross-driver parity claim is made; the Bun adapter path is unchanged and was not run.
- Not run locally: the full unit suite, coverage gate, full-repository lint and production build. Hosted CI results will be reported separately.

**Refresh (`3cb07ae`, base `8e58decb`):** 12 related test files **121/121**, including the unmodified `presets-item-dashboard-auth` tests from #18386; UI tests 15/15; `check:db-rules`, `check:migration-numbering`, `check-api-typecheck`, `typecheck:core`, ESLint/Prettier on changed files, `check:file-size`, `check-complexity-ratchets`, `measure-boundary --ratchet`, `check-changelog-integrity` and `git diff --check` all exit 0. An independent review of the merge found no blocking issues; recreating the automatic merge differs from this commit only in the two resolved route files.


- Independent exact-tree review: no blocking findings; Node 26.8.2 / better-sqlite3, 117 focused tests and 15 UI tests passed. All four injected regressions were detected. Seven error-path probes passed and were independently replayed unchanged. Retaining those extra failure-injection probes in the committed suite is optional follow-up coverage.

## Tests Added Or Updated

- `tests/unit/db-playground-presets-characterization.test.ts` (new): pagination/total, timestamp ties, no-write patches, nullish create, defensive JSON mapping, same-DATA_DIR reset/reopen.
- `tests/helpers/persistence/playgroundPresetRepositoryConformance.ts` (new): portable behaviour suite; raw SQLite fixtures live in harness hooks.
- `tests/unit/db/repositories/sqlitePlaygroundPresetRepository.test.ts` (new): registers the suite for SQLite and checks that the legacy facade stays synchronous and shares data with the repository.
- No existing test file was modified.

## Coverage Notes

The moved SQL is covered by the existing preset DB/route tests plus the new characterization and conformance tests above.

## Reviewer Notes

- No migration, flag or schema change. Rollback is reverting this PR.
- One stale header comment was corrected (the table comes from migration `084`, not `076`), and the old `TODO(F1-merge)` note about importing the list-item type from `@/shared/schemas/playground` was removed together with the interface it annotated. The type now comes from the domain contract.


<details>
<summary>中文说明</summary>

## 概要

这是 #17952 提出的第一片实现：把 **Playground 调试预设** 的存储访问移到基于 Promise 的领域 Repository 之后，沿用 #8757 已合并的 Combo Repository 模式。两个 Playground 预设 API 路由改为 `await` Repository；`src/lib/db/playgroundPresets.ts` 原有的同步导出保留为只支持 SQLite 的兼容函数。两条路径共用同一份 SQLite 实现，SQL 不重复。

本 PR 只调整存储边界：不新增数据库驱动，不加后端选择，不改表结构或迁移，不改鉴权，也不改界面。

**状态：可审阅，设计尚未确认。** #17952 请维护者确认能力范围图、实现分片顺序以及同步兼容的处理方式，目前都还没有确认。转为可审阅是为了跑完整 CI、方便对照审阅，不代表设计已被接受。维护者若希望调整、换一种拆法或认为方向不合适，都可以改或直接关闭。

## 关联议题

- 关联 #17952（不关闭它；该议题跟踪整个 Repository 抽取）
- 沿用 #8757 / #8261（#8075）的模式

## 目标分支

- [x] 目标为当前活跃的 `release/v3.8.53`（最高的 `release/v*`），不是 `main`
- 最初基于 `daca9902e859bc1aa95ba276e3ef200ba7f5d142` 实现；之后用普通 merge 合入 `release/v3.8.53` 的 `8e58decb5c0e3551326de138fb8c4ba2e9c44a29` 刷新（没有 rebase 或 force-push）。
- 唯一的冲突是两个预设路由文件：#18386 把它们的鉴权移进了 `checkPlaygroundPresetAuth`。处理方式：鉴权与 release 分支完全一致，只有数据读写改走 repository。相对 `8e58decb`，差异正好是本 PR 的 10 个文件。

repository 改动在 `6684869f590f00872af9849f33117a12a1a39503` 上验收；`07ec4b8e206903a0fc824d6a72fc63d5421c3fff` 只补更新日志编号。当前 head `3cb07ae8ff2718d8752a655754e43890ea367091` 是刷新合并，已重新验证并审查（见下方「刷新」）。

## 设计

- `src/domain/persistence/playgroundPresetRepository.ts`：记录、创建/修改输入和分页类型，以及 `PlaygroundPresetRepository`（`list`、`findById`、`create`、`update`、`deleteById`，全部返回 Promise）。不含 SQLite 类型。
- `src/lib/db/repositories/sqlitePlaygroundPresetRepository.ts`：原 SQL 原样移入，作为私有同步函数，同时支撑异步 Repository 对象和显式的 `legacySync` 对象。每次调用都通过 `getDbInstance()` 取库，`resetDbInstance()` 之后不会残留失效句柄。
- `src/lib/db/repositories/playgroundRepositories.ts`：只绑定 SQLite 的组装入口（`presets` + `legacySync`），刻意不提供后端切换。
- `src/lib/db/playgroundPresets.ts`：保留所有原有导出的名称、参数和同步返回类型；新增 `getPlaygroundPresetRepository()` 供异步调用方使用。`PlaygroundPresetListItem` 改为领域记录类型的别名，结构相同。
- 路由：只改了存储调用。鉴权（包括集合路由接受面板会话、单项路由不接受这一既有差异）、校验、CORS、状态码与响应体均不变。

有意保持不变的行为：按创建时间倒序，不新增并列排序条件；未给 `limit` 时忽略 `offset`；`total` 是未分页的总数；不存在的 id 和空补丁不写库；补丁里出现 `system` 键且值为 null 或 undefined 时写为 `null`；存储的 `params_json` 损坏或不是对象时读成 `{}`。

## 验证

- [x] 变更类型：DB
- [x] 按 golden path 跑了相关测试和该类门禁
- [x] 对每个改动文件跑了 ESLint 与 Prettier
- [x] 生产代码改动带有新增自动化测试

在准确 head 上运行，依赖与 lockfile 一致，数据目录隔离，并挂了只允许本机地址的网络拦截。node:test 执行器选择 Node 24.13.0；UI 与静态检查使用 Node 26.8.2：

- 9 个既有相关测试文件（未修改）：冻结基线与 head 均 **102/102** 通过。
- 新增测试：合跑 **15/15**；两个文件各自在新进程单独运行也通过（7/7、8/8）。UI 钩子与选择器 Vitest：**15/15**。
- 实现前的 RED：一致性测试以 `ERR_MODULE_NOT_FOUND` 失败（0 通过 / 1 失败）；特征化测试在改生产代码前就已在原代码上通过。
- 门禁全部退出码 0：`check:db-rules`、`check:migration-numbering`、`check-api-typecheck`（基线内 248 个，无新增）、`typecheck:core`、`check:file-size`、`check-complexity-ratchets --base-ref`、`measure-boundary --ratchet --base-ref`（774 = 774）、`check:changelog-integrity`（`CHANGELOG_BASE_REF` 为冻结基线）、`check:test-masking`（指定基线 SHA）、`check:test-discovery`、`check:test-runner-api`、`git diff --check`。
- `check:mutation-test-coverage --strict` 在冻结基线和本 head 上以完全相同的清单失败（涉及无关的 `open-sse` 模块）；本片没有给 Stryker 的 mutate 列表增加模块。
- 通过现有适配器选择运行 SQLite 测试，不声称已验证跨驱动一致性；Bun 适配器路径未改动，也未运行。
- 本地未跑：完整单元测试、覆盖率门禁、全仓 lint 与生产构建。托管 CI 结果另行核实。

**刷新（`3cb07ae`，基线 `8e58decb`）：** 12 个相关测试文件 **121/121** 通过，包含 #18386 新增且未修改的 `presets-item-dashboard-auth` 测试；UI 测试 15/15；`check:db-rules`、`check:migration-numbering`、`check-api-typecheck`、`typecheck:core`、改动文件的 ESLint/Prettier、`check:file-size`、`check-complexity-ratchets`、`measure-boundary --ratchet`、`check-changelog-integrity` 与 `git diff --check` 全部退出码 0。对这次合并的独立审查没有阻塞项；重建自动合并结果后，与本提交只差两个已解决冲突的路由文件。

独立审查无阻塞项，使用 Node 26.8.2 / better-sqlite3 跑通 117 项相关测试和 15 项 UI 测试，四种故意引入的回归均被检测到。另有 7 项错误路径探针通过，并已原样独立重跑；将这些额外探针保留进提交中的测试集属于可选后续补充。

## 新增或修改的测试

- `tests/unit/db-playground-presets-characterization.test.ts`（新增）：分页与总数、时间戳并列、不写库的补丁、空值创建、防御性 JSON 映射、同一 DATA_DIR 的重置与重开。
- `tests/helpers/persistence/playgroundPresetRepositoryConformance.ts`（新增）：可移植的行为测试集；直接改 SQLite 的夹具放在 harness 钩子里。
- `tests/unit/db/repositories/sqlitePlaygroundPresetRepository.test.ts`（新增）：为 SQLite 注册上述测试集，并验证旧兼容函数仍是同步的、且与 Repository 共享数据。
- 没有修改任何既有测试文件。

## 覆盖说明

移动后的 SQL 由既有预设 DB/路由测试，加上上面新增的特征化与一致性测试覆盖。

## 审阅提示

- 没有迁移、开关或表结构变更；回滚只需 revert 本 PR。
- 更正了一处过时的头部注释（表来自迁移 `084`，不是 `076`）；原先标注列表类型、说明“待改为从 `@/shared/schemas/playground` 导入”的 `TODO(F1-merge)` 随该接口一起移除，类型现在来自领域契约。

![两条访问路径共用同一份 SQLite 实现：路由等待 Repository，旧函数保持同步。](https://raw.githubusercontent.com/xiaoyaner0201/OmniRoute/22542db12b7e778b24c54d2a8ee823ec0acab3fa/playground-repository-zh.jpg)

</details>


## Infographic

![Two access paths share the same SQLite preset implementation; routes await the repository and legacy helpers remain synchronous.](https://raw.githubusercontent.com/xiaoyaner0201/OmniRoute/22542db12b7e778b24c54d2a8ee823ec0acab3fa/playground-repository-en.jpg)

