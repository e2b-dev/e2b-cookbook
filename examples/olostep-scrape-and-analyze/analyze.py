import re
import pandas as pd
import matplotlib.pyplot as plt

md = open("/home/user/page.md", encoding="utf-8").read()

pattern = re.compile(
    r"\[([^\]]*\(YC [A-Z]\d{2}\)[^\]]*)\]\(([^)]+)\)[\s\S]{0,300}?\[(\d+) days? ago\]"
)

jobs = []
for title, url, days in pattern.findall(md):
    batch = re.search(r"\(YC ([A-Z]\d{2})\)", title).group(1)
    jobs.append({
        "title": title,
        "company": title.split("(YC")[0].strip(),
        "yc_batch": batch,
        "year": 2000 + int(batch[1:]),
        "days_ago": int(days),
        "url": url,
    })

df = pd.DataFrame(jobs)
print(f"parsed {len(df)} listings")
print(df[["company", "yc_batch", "days_ago"]].head(10).to_string(index=False))
print()
print("median days since posting:", int(df["days_ago"].median()))

counts = df["year"].value_counts().sort_index()

fig, ax = plt.subplots(figsize=(10, 5))
ax.bar(counts.index.astype(str), counts.values, color="#f26522")
ax.set_xlabel("YC batch year")
ax.set_ylabel("Open roles on HN Jobs")
ax.set_title("Which YC cohorts are hiring right now")
ax.spines[["top", "right"]].set_visible(False)
fig.tight_layout()
fig