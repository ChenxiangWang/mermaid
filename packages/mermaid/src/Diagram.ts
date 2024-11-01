import * as configApi from './config.js';
import { getDiagram, registerDiagram } from './diagram-api/diagramAPI.js';
import { detectType, getDiagramLoader } from './diagram-api/detectType.js';
import { UnknownDiagramError } from './errors.js';
import { encodeEntities } from './utils.js';
import type { DetailedError } from './utils.js';
import type { DiagramDefinition, DiagramMetadata } from './diagram-api/types.js';

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type ParseErrorFunction = (err: string | DetailedError | unknown, hash?: any) => void;

/**
 * An object representing a parsed mermaid diagram definition.
 * @privateRemarks This is exported as part of the public mermaidAPI.
 */
export class Diagram {
  public static async fromText(text: string, metadata: Pick<DiagramMetadata, 'title'> = {}) {
    // 获取当前配置
    const config = configApi.getConfig();
    // 获取当前图形的类型, 例如流程图、序列图、类图等等
    const type = detectType(text, config);
    // 使用 encodeEntities 对文本中的特殊字符进行 HTML 实体编码，确保图表文本在渲染时不会产生意外字符显示或解析问题。
    text = encodeEntities(text) + '\n';

    /**
     * fromText 首先尝试从 Mermaid 注册的图表类型中获取对应 type 的图表定义。 抛出异常
     * getDiagramLoader 会尝试动态加载图表模块，并通过 registerDiagram 注册到 Mermaid 中。
     * 为什么要动态加载：这是为了支持按需加载不同类型的图表，避免加载不必要的解析和渲染逻辑，从而提升性能。
     */
    try {
      // 获取“graph”的定义
      getDiagram(type);
    } catch {
      // 是否是借鉴了 webpack - loader的思想呢?
      const loader = getDiagramLoader(type);
      if (!loader) {
        throw new UnknownDiagramError(`Diagram ${type} not found.`);
      }
      // Diagram not available, loading it.
      // new diagram will try getDiagram again and if fails then it is a valid throw
      const { id, diagram } = await loader();
      registerDiagram(id, diagram);
    }
    /**
     * 拿到“Diagram”的定义包括:
     * db 数据库对象. parser:解析器, 将mermaid文本转化为图表的内部数据结构
     * renderer: 渲染器, 用于将内部数据结构渲染为svg
     * init: 初始化函数, 用于在渲染前初始化配置和环境
     */
    const { db, parser, renderer, init } = getDiagram(type);
    if (parser.parser) {
      // The parser.parser.yy is only present in JISON parsers. So, we'll only set if required.
      parser.parser.yy = db;
    }
    // 清理上一次的数据?
    db.clear?.();
    init?.(config);
    // This block was added for legacy compatibility. Use frontmatter instead of adding more special cases.
    if (metadata.title) {
      db.setDiagramTitle?.(metadata.title);
    }
    //调用 parser.parse(text)，将文本解析为图表的内部结构，解析后的数据会被存储在 db 中。
    await parser.parse(text);
    return new Diagram(type, text, db, parser, renderer);
  }

  private constructor(
    public type: string,
    public text: string,
    public db: DiagramDefinition['db'],
    public parser: DiagramDefinition['parser'],
    public renderer: DiagramDefinition['renderer']
  ) {}

  async render(id: string, version: string) {
    await this.renderer.draw(this.text, id, version, this);
  }

  getParser() {
    return this.parser;
  }

  getType() {
    return this.type;
  }
}
