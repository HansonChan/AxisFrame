# AxisFrame

**中文** | [English](README_EN.md)

AxisFrame 是一款面向 DIY 创客与轻量结构设计者的约束驱动 3D 设计工具。它把真实比例的光轴、连接件、轴承和层板带入同一个浏览器工作台，让不熟悉传统 CAD 的用户也能像搭积木一样完成结构方案，并生成可用于采购与装配的清单。

## 主要功能

- 在浏览器中完成光轴框架、连接件与层板的 3D 组合设计。
- 使用内置组件库和结构模板快速起步，并按库存规格调整尺寸、材质、孔位和方向。
- 通过智能参考线、连接端口、表面接触约束与整体尺寸调整辅助装配。
- 提供撤销/重做、复制、镜像、分组、爆炸图、参考图和多视角检查等编辑能力。
- 实时检查连接关系、结构支撑与重力风险，并同步生成 BOM。
- 导出订单工作簿和项目 JSON；项目、模板与自动保存数据默认保存在当前浏览器。
- 支持中英文界面、明暗主题与响应式布局。

## 技术栈

React 19、TypeScript、Three.js、React Three Fiber、Vite 7 和 ExcelJS。应用为纯前端项目，不需要单独配置后端或数据库。

## 安装与运行

准备以下环境：

- Node.js `^20.19.0` 或 `>=22.12.0`
- npm
- 支持 WebGL 的现代桌面浏览器

克隆并安装依赖：

```bash
git clone https://github.com/HansonChan/AxisFrame.git
cd AxisFrame
npm ci
```

启动本地开发服务器：

```bash
npm run dev
```

然后访问 [http://127.0.0.1:5173](http://127.0.0.1:5173)。

## 生产构建

```bash
npm run build
npm run preview
```

生产文件会生成在 `dist/`，预览服务默认使用本机地址。若要部署到静态托管平台，发布 `dist/` 目录即可。

## 项目结构

```text
AxisFrame/
├── src/             # 页面、3D 场景、编辑器和领域逻辑
├── public/assets/   # 网页运行时使用的模型、图片与预览资源
├── index.html       # Web 入口
├── package.json     # 依赖与运行命令
└── vite.config.ts   # Vite 开发服务器配置
```

## 数据说明

AxisFrame 当前把项目数据保存在浏览器本地存储中。清除站点数据或更换浏览器前，请先导出项目 JSON 备份。导入的参考图片也会随项目快照保存在本地。

## 许可证

本项目采用 [MIT License](LICENSE)。
