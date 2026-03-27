# T8 - M8：DOCX 导出升级

> 对应模块：M8  
> 改动文件：`src/lib/pm-review-docx-export.ts`（微调）、`scripts/annotate_pm_review_docx.py`（升级）  
> 依赖：M1, M6  
> 被依赖：M7（导出 API 调用）

---

## 一、改动范围

| 文件 | 改动量 | 说明 |
|------|--------|------|
| `src/lib/pm-review-docx-export.ts` | 无改动 | 透传 JSON，新字段自动传到 Python |
| `scripts/annotate_pm_review_docx.py` | 小改 | 批注文本拼接逻辑升级 |

---

## 二、TypeScript 侧

现有 `exportPmReviewDocx(sourceBuffer, comments)` **不需要改动**。

原因：comments 直接 `JSON.stringify` 写入临时文件，Python 侧读取后自行解析。新增的 `searchEvidence` 和 `previousRoundStatus` 字段自动包含在 JSON 中。

---

## 三、Python 脚本升级

### 3.1 批注文本格式

旧格式：
```
[问题] 数据口径缺失
[建议] 补充统计周期和归因依据后再保留数字。
[示例] ...（如有）
```

新格式：
```
[问题] 数据口径缺失
[建议] 补充统计周期和归因依据后再保留数字。
[示例] ...（如有）
[搜索参考] 该公司为中小型SaaS企业，行业平均注册转化率约60-80%。（如有）
[多轮状态] 上次已指出，学员未修改（如有）
```

### 3.2 Python 实现要点

```python
def build_comment_text(comment: dict) -> str:
    lines = []
    lines.append(f"[问题] {comment['issueType']}")
    lines.append(f"[建议] {comment['suggestion']}")
    
    if comment.get('example'):
        lines.append(f"[示例] {comment['example']}")
    
    # 🆕 搜索验证依据
    if comment.get('searchEvidence'):
        lines.append(f"[搜索参考] {comment['searchEvidence']}")
    
    # 🆕 多轮状态
    status = comment.get('previousRoundStatus')
    if status:
        status_text = {
            'new': '本轮新发现',
            'modified': '上次已指出，学员已修改但仍需改进',
            'unchanged': '上次已指出，学员未修改',
            'resolved': '已解决',
        }.get(status, '')
        if status_text:
            lines.append(f"[多轮状态] {status_text}")
    
    return '\n'.join(lines)
```

### 3.3 anchorText 定位

保持现有定位逻辑不变（精确匹配 → 模糊匹配 → 段落级兜底）。

---

## 四、注意事项

1. **TypeScript 侧零改动**：新字段通过 JSON 自动透传
2. **Python 脚本改动很小**：只在 `build_comment_text` 中加两个条件分支
3. **新字段为空时不展示**：`searchEvidence` 和 `previousRoundStatus` 为 `null/undefined` 时跳过
4. **测试时注意**：需用包含新字段的 comments JSON 测试导出，确认格式正确

---

## 五、验证方式

```bash
# 1. 准备包含 searchEvidence 的 comments JSON
# 2. 调用导出 API → 下载 Word
# 3. 检查批注内容是否包含 [搜索参考] 行
# 4. 检查 previousRoundStatus 对应的中文文本是否正确
# 5. 检查无 searchEvidence 的批注是否正常（不多出空行）
```
