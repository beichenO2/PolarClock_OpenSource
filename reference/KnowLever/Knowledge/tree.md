# Knowledge Tree

- project: Clock
- generated_at: 2026-05-02T15:33:20.709Z

## 关键设计

- reference/ (`readme`)
- Clone项目参考目录管理规范 (`src-reference-directory-spec`)
  - Clone 项目制定了 reference/ 目录的参考资料管理规范，明确采用只读模式管理外部参考材料，将开源项目、论文、技术博客等资料与项目源码分离存储，并对大文件提出 Git LFS 或链接引用的处理建议。
- Git LFS (`entity-git-lfs`)
  - Git LFS（Large File Storage）是 Git 的开源扩展，专门用于高效管理仓库中的大体积文件，通过将文件内容存储在远程服务器而在 Git 仓库中仅保留轻量指针，显著减少仓库体积。
- reference/ 目录 (`entity-reference-dir`)
  - Clone 项目中专门用于集中管理外部参考资料的目录模块，采用只读模式存放开源项目、论文、技术博客等资料，与项目源码分离存储。
- 参考材料分类 (`concept-reference-categorization`)
  - 参考材料分类是一种知识管理方法，通过按来源类型（开源项目、论文、技术博客等）对参考资料进行分组存储，实现资料的有序组织与快速检索，提升项目知识资产的可维护性和复用效率。
- 只读参考资料管理 (`concept-reference-management`)
  - 只读参考资料管理是一种项目资料管理规范，通过建立独立的只读目录隔离存放外部参考资料（开源项目、论文、技术文档等），与项目源码实现物理分离，以保持项目结构的清晰性和可维护性。

## 总体设计

- 总体设计/concept (`overall-concept`)
  - 由 3 个关键设计节点抽象而来
- 总体设计/source (`overall-source`)
  - 由 1 个关键设计节点抽象而来
- 总体设计/entity (`overall-entity`)
  - 由 2 个关键设计节点抽象而来

## 一般逻辑

- 这类项目的一般逻辑 (`general-logic-core`)
  - 从多个总体设计层抽象出的通用逻辑骨架
  - 从 source/concept/entity 页面抽取可复用结构
  - 按问题-方法-约束组织知识层次
  - 优先沉淀可被 Agent 复用的设计规则

