import type { CompanySearchResult, IndustrySearchResult } from "@/lib/types";

interface SearchProvider {
  searchCompany(companyName: string): Promise<CompanySearchResult | null>;
  searchIndustry(keyword: string, metric: string): Promise<IndustrySearchResult | null>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`搜索超时 (${ms}ms)`)), ms),
    ),
  ]);
}

// ─── Mock Provider ────────────────────────────────────────────────────────────

const MOCK_COMPANIES: Record<string, CompanySearchResult> = {
  阿里巴巴: {
    name: "阿里巴巴集团",
    industry: "互联网/电子商务",
    scale: "大型",
    mainBusiness: "电商、云计算、数字媒体",
    source: "mock",
  },
  腾讯: {
    name: "腾讯科技",
    industry: "互联网/社交",
    scale: "大型",
    mainBusiness: "社交、游戏、金融科技",
    source: "mock",
  },
  字节跳动: {
    name: "字节跳动",
    industry: "互联网/内容",
    scale: "大型",
    mainBusiness: "短视频、信息分发、企业服务",
    source: "mock",
  },
  美团: {
    name: "美团",
    industry: "互联网/本地生活",
    scale: "大型",
    mainBusiness: "外卖、到店、酒旅",
    source: "mock",
  },
  京东: {
    name: "京东集团",
    industry: "互联网/电子商务",
    scale: "大型",
    mainBusiness: "自营电商、物流、金融科技",
    source: "mock",
  },
  百度: {
    name: "百度",
    industry: "互联网/搜索引擎",
    scale: "大型",
    mainBusiness: "搜索、AI、自动驾驶",
    source: "mock",
  },
  网易: {
    name: "网易",
    industry: "互联网/游戏",
    scale: "大型",
    mainBusiness: "游戏、教育、音乐",
    source: "mock",
  },
  滴滴: {
    name: "滴滴出行",
    industry: "互联网/出行",
    scale: "大型",
    mainBusiness: "网约车、货运、自动驾驶",
    source: "mock",
  },
  小红书: {
    name: "小红书",
    industry: "互联网/社交电商",
    scale: "中型",
    mainBusiness: "内容社区、电商、广告",
    source: "mock",
  },
  拼多多: {
    name: "拼多多",
    industry: "互联网/社交电商",
    scale: "大型",
    mainBusiness: "下沉市场电商、农业",
    source: "mock",
  },
};

const MOCK_BENCHMARKS: Record<string, IndustrySearchResult> = {
  转化率: {
    benchmark: "电商平均转化率 2-5%，优秀可达 8-10%",
    source: "mock",
    confidence: "medium",
  },
  留存率: {
    benchmark: "工具类 App 次日留存 30-40%，社交类 50-60%",
    source: "mock",
    confidence: "medium",
  },
  DAU: {
    benchmark: "中型 App DAU 通常 10w-100w 级别",
    source: "mock",
    confidence: "low",
  },
  注册成功率: {
    benchmark: "主流产品注册转化率 60-85%",
    source: "mock",
    confidence: "medium",
  },
  GMV: {
    benchmark: "中型电商平台年 GMV 通常在 10-100 亿级别",
    source: "mock",
    confidence: "low",
  },
  活跃用户: {
    benchmark: "中型 C 端产品月活 100w+ 为良好，千万级以上为头部",
    source: "mock",
    confidence: "medium",
  },
  点击率: {
    benchmark: "信息流广告 CTR 通常 1-3%，优质素材可达 5%+",
    source: "mock",
    confidence: "medium",
  },
  完播率: {
    benchmark: "短视频完播率行业平均 30-50%，优质内容可达 70%+",
    source: "mock",
    confidence: "medium",
  },
};

const mockProvider: SearchProvider = {
  async searchCompany(companyName: string): Promise<CompanySearchResult | null> {
    for (const [key, result] of Object.entries(MOCK_COMPANIES)) {
      if (companyName.includes(key) || key.includes(companyName)) {
        console.log("[pm-review-tools] mock searchCompany 命中", { companyName, key });
        return result;
      }
    }
    console.log("[pm-review-tools] mock searchCompany 未匹配，返回通用信息", { companyName });
    return {
      name: companyName,
      industry: "互联网/科技",
      scale: "中小型",
      mainBusiness: "暂无详细信息",
      source: "mock",
    };
  },

  async searchIndustry(keyword: string, metric: string): Promise<IndustrySearchResult | null> {
    const combined = `${keyword} ${metric}`;
    for (const [key, result] of Object.entries(MOCK_BENCHMARKS)) {
      if (combined.includes(key) || keyword.includes(key) || metric.includes(key)) {
        console.log("[pm-review-tools] mock searchIndustry 命中", { keyword, metric, key });
        return result;
      }
    }
    console.log("[pm-review-tools] mock searchIndustry 未匹配", { keyword, metric });
    return null;
  },
};

// ─── Provider 路由 ────────────────────────────────────────────────────────────

function getProvider(): SearchProvider {
  const provider = process.env.SEARCH_API_PROVIDER ?? "mock";
  switch (provider) {
    case "mock":
      return mockProvider;
    case "tavily":
      // 后续实现 tavilyProvider
      console.warn("[pm-review-tools] tavily provider 暂未实现，降级为 mock");
      return mockProvider;
    default:
      console.warn("[pm-review-tools] 未知 provider，降级为 mock", { provider });
      return mockProvider;
  }
}

// ─── 导出函数 ─────────────────────────────────────────────────────────────────

export async function searchCompany(companyName: string): Promise<CompanySearchResult | null> {
  const provider = getProvider();
  try {
    const result = await withTimeout(provider.searchCompany(companyName), 5000);
    console.log("[pm-review-tools] searchCompany 完成", { companyName, found: result !== null });
    return result;
  } catch (e) {
    console.warn("[pm-review-tools] searchCompany 失败", {
      companyName,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export async function searchIndustry(
  keyword: string,
  metric: string,
): Promise<IndustrySearchResult | null> {
  const provider = getProvider();
  try {
    const result = await withTimeout(provider.searchIndustry(keyword, metric), 5000);
    console.log("[pm-review-tools] searchIndustry 完成", { keyword, metric, found: result !== null });
    return result;
  } catch (e) {
    console.warn("[pm-review-tools] searchIndustry 失败", {
      keyword,
      metric,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

// ─── 内存缓存（单次 Agent 调用周期内复用） ────────────────────────────────────

export function createSearchCache() {
  const cache = new Map<string, unknown>();

  return {
    async searchCompany(name: string): Promise<CompanySearchResult | null> {
      const key = `company:${name}`;
      if (cache.has(key)) {
        console.log("[pm-review-tools] 缓存命中 searchCompany", { name });
        return cache.get(key) as CompanySearchResult | null;
      }
      const result = await searchCompany(name);
      cache.set(key, result);
      return result;
    },
    async searchIndustry(keyword: string, metric: string): Promise<IndustrySearchResult | null> {
      const key = `industry:${keyword}:${metric}`;
      if (cache.has(key)) {
        console.log("[pm-review-tools] 缓存命中 searchIndustry", { keyword, metric });
        return cache.get(key) as IndustrySearchResult | null;
      }
      const result = await searchIndustry(keyword, metric);
      cache.set(key, result);
      return result;
    },
  };
}
