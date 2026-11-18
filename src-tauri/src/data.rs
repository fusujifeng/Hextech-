//! 随包静态数据：resg.top（海克斯大乱斗数据站）元数据 + 推荐出装 / 强化符文。
//!
//! 两份 JSON 由 `scripts/gen-data.mjs` 生成，编译期通过 `include_str!` 打进二进制，
//! 因此断网时应用依然可用（只有图片需要联网）。

use std::collections::HashMap;
use std::sync::LazyLock;

use serde::{Deserialize, Serialize};

static RESG: LazyLock<Resg> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../data/resg.json")).expect("resg.json 解析失败")
});

static RECS: LazyLock<Recommendations> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../data/recommendations.json")).expect("recommendations.json 解析失败")
});

/// 英雄外号表（按 Data Dragon alias 索引），让「男枪」「石头人」这类俗称也能搜到。
static NICKNAMES: LazyLock<HashMap<String, Vec<String>>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../data/nicknames.json")).expect("nicknames.json 解析失败")
});

// ── 原始数据结构 ─────────────────────────────────────────────────────

#[derive(Deserialize)]
struct Resg {
    version: String,
    /// 生成这份数据时 OP.GG 的版本（强化梯度数据）
    #[serde(rename = "opggVersion", default)]
    opgg_version: String,
    #[serde(rename = "generatedAt")]
    generated_at: String,
    champions: HashMap<String, ChampMeta>,
    items: HashMap<String, ItemMeta>,
    augments: HashMap<String, AugMeta>,
}

#[derive(Deserialize)]
struct ChampMeta {
    name: String,
    title: String,
    alias: String,
    roles: Vec<String>,
    tier: String,
    #[serde(rename = "winRate")]
    win_rate: f64,
    icon: String,
}

#[derive(Deserialize)]
struct ItemMeta {
    name: String,
    icon: String,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct AugMeta {
    name: String,
    icon: String,
    quality: u8,
    tier: String,
    #[serde(rename = "winRate")]
    win_rate: f64,
    desc: String,
}

#[derive(Deserialize)]
struct Recommendations {
    #[serde(rename = "gameVersion")]
    game_version: String,
    #[serde(rename = "generatedAt")]
    generated_at: String,
    champions: HashMap<String, RecEntry>,
}

/// 强化条目紧凑格式：[id, 强度分, 选用率, 品质, OP.GG 梯度(0=S…5=E)]
type AugPick = (i64, Option<f64>, Option<f64>, u8, u8);

#[derive(Deserialize)]
struct RecEntry {
    start: Vec<i64>,
    boots: Vec<i64>,
    core: Vec<i64>,
    situational: Vec<i64>,
    augments: Vec<AugPick>,
    #[serde(rename = "winRate")]
    win_rate: f64,
    tier: String,
    games: i64,
    nerf: HashMap<String, String>,
}

// ── 对外视图 ─────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ItemView {
    pub id: i64,
    pub name: String,
    pub icon: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AugmentView {
    pub id: i64,
    pub name: String,
    pub icon: String,
    /// 1 = 白银, 2 = 黄金, 3 = 棱彩
    pub quality: u8,
    /// OP.GG 梯度：0=S, 1=A, 2=B, 3=C, 4=D, 5=E；255 = 无数据
    pub grade: u8,
    /// OP.GG 强度分（100 ≈ 该模式平均），无数据时为 null
    pub performance: Option<f64>,
    /// OP.GG 选用率（百分比）
    pub popular: Option<f64>,
    /// 名次，从 1 开始（按 OP.GG 强度从高到低）
    pub rank: usize,
    /// 同品质内的 OP.GG 排名（1 = 该品质最强，例如「黄金第 3」）
    pub tier_rank: usize,
    /// 该品质有数据的强化总数
    pub tier_total: usize,
    pub desc: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChampionView {
    pub id: i32,
    /// 英雄名称，例如「格雷福斯」
    pub name: String,
    /// 英雄称号，例如「法外狂徒」
    pub title: String,
    pub alias: String,
    pub roles: Vec<String>,
    pub tier: String,
    pub win_rate: f64,
    pub icon: String,
    /// 俗称 / 外号，例如「男枪」
    pub nicknames: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    pub champion: ChampionView,
    pub mode: String,
    pub mode_label: String,
    pub starter: Vec<ItemView>,
    pub boots: Vec<ItemView>,
    pub core: Vec<ItemView>,
    pub situational: Vec<ItemView>,
    pub augments: Vec<AugmentView>,
    /// 该英雄在大乱斗的承伤 / 输出修正，例如 "承受伤害" -> "105%"
    pub nerf: Vec<(String, String)>,
    pub win_rate: f64,
    pub tier: String,
    pub games: i64,
    pub tip: String,
    pub source: String,
    pub version: String,
    pub updated_at: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChampionBrief {
    pub id: i32,
    /// 英雄名称，例如「格雷福斯」
    pub name: String,
    /// 英雄称号，例如「法外狂徒」
    pub title: String,
    pub alias: String,
    pub roles: Vec<String>,
    pub tier: String,
    pub win_rate: f64,
    pub nicknames: Vec<String>,
    pub icon: String,
}

/// 选人界面「强度榜」条目：全英雄按 OP.GG 胜率降序排名。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChampionRank {
    pub id: i32,
    pub name: String,
    pub title: String,
    pub alias: String,
    pub tier: String,
    pub win_rate: f64,
    pub icon: String,
    /// 全英雄排名，1 = 最强
    pub rank: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub version: String,
    /// OP.GG 的强化数据版本（可能比 resg 新，如 resg 16.22 / OP.GG 16.23）
    pub opgg_version: String,
    pub champion_count: usize,
    pub item_count: usize,
    pub augment_count: usize,
    pub updated_at: String,
    pub source: String,
}

// ── 查询 ─────────────────────────────────────────────────────────────

/// 外号去掉与英雄名重复的条目，避免搜索卡片里出现「格雷福斯 / 格雷福斯」
fn nicknames(alias: &str, name: &str) -> Vec<String> {
    NICKNAMES
        .get(alias)
        .map(|list| {
            list.iter()
                .filter(|n| n.as_str() != name)
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

fn champion_view(id: i32) -> Option<ChampionView> {
    let c = RESG.champions.get(&id.to_string())?;
    Some(ChampionView {
        id,
        // resg 的 name 字段其实是称号，title 字段才是英雄名，这里翻转成通用语义
        name: c.title.clone(),
        title: c.name.clone(),
        alias: c.alias.clone(),
        roles: c.roles.clone(),
        tier: c.tier.clone(),
        win_rate: c.win_rate,
        icon: c.icon.clone(),
        nicknames: nicknames(&c.alias, &c.title),
    })
}

fn item_view(id: i64) -> Option<ItemView> {
    let it = RESG.items.get(&id.to_string())?;
    Some(ItemView {
        id,
        name: it.name.clone(),
        icon: it.icon.clone(),
    })
}

fn augment_view(id: i64) -> Option<AugmentView> {
    let a = RESG.augments.get(&id.to_string())?;
    Some(AugmentView {
        id,
        name: a.name.clone(),
        icon: a.icon.clone(),
        quality: a.quality,
        grade: 0,
        performance: None,
        popular: None,
        rank: 0,
        tier_rank: 0,
        tier_total: 0,
        desc: a.desc.clone(),
    })
}

fn items(ids: &[i64]) -> Vec<ItemView> {
    ids.iter().filter_map(|id| item_view(*id)).collect()
}

pub fn champion_name(id: i32) -> Option<String> {
    RESG.champions.get(&id.to_string()).map(|c| c.title.clone())
}

pub fn meta() -> Meta {
    Meta {
        version: RESG.version.clone(),
        opgg_version: RESG.opgg_version.clone(),
        champion_count: RESG.champions.len(),
        item_count: RESG.items.len(),
        augment_count: RESG.augments.len(),
        updated_at: RESG.generated_at.clone(),
        source: "resg.top".into(),
    }
}

pub fn champions() -> Vec<ChampionBrief> {
    let mut list: Vec<ChampionBrief> = RESG
        .champions
        .iter()
        .filter_map(|(id, c)| {
            Some(ChampionBrief {
                id: id.parse().ok()?,
                name: c.title.clone(),
                title: c.name.clone(),
                alias: c.alias.clone(),
                roles: c.roles.clone(),
                tier: c.tier.clone(),
                win_rate: c.win_rate,
                nicknames: nicknames(&c.alias, &c.title),
                icon: c.icon.clone(),
            })
        })
        .collect();
    list.sort_by(|a, b| a.id.cmp(&b.id));
    list
}

/// 全英雄强度排序的原料：胜率降序，同胜率看样本量，最后按 id 保证顺序稳定。
struct Rated {
    id: i32,
    win_rate: f64,
    games: i64,
}

static RATED: LazyLock<Vec<Rated>> = LazyLock::new(|| {
    let mut list: Vec<Rated> = RESG
        .champions
        .iter()
        .filter_map(|(id, c)| {
            let id: i32 = id.parse().ok()?;
            let games = RECS
                .champions
                .get(&id.to_string())
                .map(|r| r.games)
                .unwrap_or(0);
            Some(Rated {
                id,
                win_rate: c.win_rate,
                games,
            })
        })
        .collect();

    list.sort_by(|a, b| {
        b.win_rate
            .partial_cmp(&a.win_rate)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.games.cmp(&a.games))
            .then_with(|| a.id.cmp(&b.id))
    });
    list
});

/// 英雄 id → 全英雄排名（1 = 最强），启动时算一次。
static RANK_OF: LazyLock<HashMap<i32, usize>> =
    LazyLock::new(|| RATED.iter().enumerate().map(|(i, r)| (r.id, i + 1)).collect());

/// 选人界面用：把「当前英雄 + 备战席英雄」按 OP.GG 强度排序，并带上全英雄排名。
pub fn champion_board(ids: &[i32]) -> Vec<ChampionRank> {
    let mut seen = std::collections::HashSet::new();

    let mut list: Vec<ChampionRank> = ids
        .iter()
        .filter(|id| seen.insert(**id))
        .filter_map(|id| {
            let c = RESG.champions.get(&id.to_string())?;
            Some(ChampionRank {
                id: *id,
                name: c.title.clone(),
                title: c.name.clone(),
                alias: c.alias.clone(),
                tier: c.tier.clone(),
                win_rate: c.win_rate,
                icon: c.icon.clone(),
                rank: *RANK_OF.get(id)?,
            })
        })
        .collect();

    list.sort_by_key(|c| c.rank);
    list
}

/// 去掉空格/标点并转小写：OCR 会在每个汉字之间插空格，必须归一化后再匹配。
fn normalize_text(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// 从 OCR 文本里找出已知强化符文名字，返回命中 id（按名字长度降序，长名字更可靠）。
pub fn find_augments_in_text(text: &str) -> Vec<i64> {
    let haystack = normalize_text(text);
    let mut hits: Vec<(usize, i64)> = Vec::new();

    for (id, meta) in RESG.augments.iter() {
        let name = normalize_text(&meta.name);
        let len = name.chars().count();
        if len < 2 {
            continue;
        }
        if haystack.contains(&name) {
            if let Ok(id) = id.parse::<i64>() {
                hits.push((len, id));
            }
        }
    }

    hits.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    hits.into_iter().map(|(_, id)| id).collect()
}

/// 用 Data Dragon alias / 中文名 / 称号反查英雄 id。
/// Live Client Data 给的是 `championName`（如 "Jinx"）或
/// `rawChampionName`（"game_character_displayname_Jinx"）。
pub fn champion_id_by_alias_or_name(key: &str) -> Option<i32> {
    let key = key.trim();
    if key.is_empty() {
        return None;
    }
    let cleaned = key
        .strip_prefix("game_character_displayname_")
        .unwrap_or(key);
    let lower = cleaned.to_lowercase();

    for (id, meta) in RESG.champions.iter() {
        if meta.alias.to_lowercase() == lower || meta.name == cleaned || meta.title == cleaned {
            return id.parse::<i32>().ok();
        }
    }
    None
}

/// 从 OCR 文本里找出英雄中文名（开局三选一英雄牌），按名字长度降序。
pub fn find_champions_in_text(text: &str) -> Vec<i64> {
    let haystack = normalize_text(text);
    let mut hits: Vec<(usize, i64)> = Vec::new();

    for (id, meta) in RESG.champions.iter() {
        // 英雄牌上可能写名字（亚索）也可能写称号（疾风剑豪），两种都试
        let mut best = 0;
        for candidate in [&meta.name, &meta.title] {
            let text = normalize_text(candidate);
            let len = text.chars().count();
            if len >= 2 && haystack.contains(&text) {
                best = best.max(len);
            }
        }
        if best > 0 {
            if let Ok(id) = id.parse::<i64>() {
                hits.push((best, id));
            }
        }
    }

    hits.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    hits.into_iter().map(|(_, id)| id).collect()
}

/// 给 OCR 命中的符文集齐当前英雄的档内排名，并按档内名次排序。
pub fn augment_picks(champion_id: i32, ids: &[i64], mode: &str) -> Vec<AugmentView> {
    let Ok(rec) = recommendation(champion_id, mode) else {
        return Vec::new();
    };

    let mut picks: Vec<AugmentView> = ids
        .iter()
        .filter_map(|id| rec.augments.iter().find(|a| a.id == *id).cloned())
        .collect();

    picks.sort_by_key(|a| a.tier_rank);
    picks
}

fn mode_label(mode: &str) -> &'static str {
    match mode {
        "mayhem" => "海克斯大乱斗",
        "aram" => "极地大乱斗",
        _ => "其他模式",
    }
}

fn tip_for(mode: &str, augments: &[AugmentView]) -> String {
    match mode {
        "mayhem" => {
            if augments.is_empty() {
                "先看强化再定装备：海克斯强化决定上限，装备围绕已拿到的强化补齐。".into()
            } else {
                format!(
                    "优先按上方强化走：拿到「{}」再补对应装备，强度最高。",
                    augments[0].name
                )
            }
        }
        "aram" => "极地大乱斗不能回城补给：优先做完核心两件，长局里血量与回复类装备更吃香。".into(),
        _ => "当前不是大乱斗模式，这套出装仅供参考。".into(),
    }
}

pub fn recommendation(champion_id: i32, mode: &str) -> Result<Recommendation, String> {
    let champion = champion_view(champion_id).ok_or_else(|| format!("未知英雄 id: {champion_id}"))?;
    let rec = RECS
        .champions
        .get(&champion_id.to_string())
        .ok_or_else(|| format!("{} 暂无统计数据（可能刚上线或样本不足）", champion.name))?;

    // 已按 OP.GG 页面顺序（S→E 梯度、同梯度按选用率）排好序，rank 直接取下标 + 1
    let mut augments: Vec<AugmentView> = rec
        .augments
        .iter()
        .enumerate()
        .filter_map(|(i, (id, performance, popular, quality, grade))| {
            let mut view = augment_view(*id)?;
            view.rank = i + 1;
            view.performance = *performance;
            view.popular = *popular;
            view.grade = *grade;
            if *quality > 0 {
                view.quality = *quality;
            }
            Some(view)
        })
        .collect();

    // 档内排名：白银 / 黄金 / 棱彩各自按 OP.GG 页面顺序编号
    // （列表本身已是强度降序，所以同品质按出现顺序递增即可）
    let mut totals: HashMap<u8, usize> = HashMap::new();
    for augment in &augments {
        *totals.entry(augment.quality).or_insert(0) += 1;
    }
    let mut seen: HashMap<u8, usize> = HashMap::new();
    for augment in augments.iter_mut() {
        let count = seen.entry(augment.quality).or_insert(0);
        *count += 1;
        augment.tier_rank = *count;
        augment.tier_total = totals.get(&augment.quality).copied().unwrap_or(0);
    }

    let mut nerf: Vec<(String, String)> = rec
        .nerf
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    nerf.sort_by(|a, b| a.0.cmp(&b.0));

    Ok(Recommendation {
        champion,
        mode: mode.to_string(),
        mode_label: mode_label(mode).to_string(),
        starter: items(&rec.start),
        boots: items(&rec.boots),
        core: items(&rec.core),
        situational: items(&rec.situational),
        tip: tip_for(mode, &augments),
        augments,
        nerf,
        win_rate: rec.win_rate,
        tier: rec.tier.clone(),
        games: rec.games,
        source: "resg.top".into(),
        version: RECS.game_version.clone(),
        updated_at: RECS.generated_at.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_loads_for_every_champion() {
        assert!(RESG.champions.len() > 150);
        assert!(RESG.items.len() > 50);
        assert!(RECS.champions.len() > 150);

        let rec = recommendation(222, "mayhem").expect("jinx");
        assert!(rec.core.len() >= 3, "core={:?}", rec.core);
        assert!(!rec.champion.name.is_empty());
        // 图标必须是随包本地资源，断网也要能显示
        assert!(
            rec.champion.icon.starts_with("/icons/champions/"),
            "{}",
            rec.champion.icon
        );
        assert!(rec.core.iter().all(|i| i.icon.starts_with("/icons/items/")));
        for augment in &rec.augments {
            assert!(augment.icon.starts_with("/icons/augments/"), "{}", augment.icon);
        }
        // 强化按 OP.GG 页面顺序（S→D 梯度，同梯度按选用率）排列，名次连续
        for (i, augment) in rec.augments.iter().enumerate() {
            assert_eq!(augment.rank, i + 1);
            assert!(augment.tier_rank >= 1);
            assert!(augment.tier_rank <= augment.tier_total);
        }
    }

    #[test]
    fn every_champion_resolves() {
        for brief in champions() {
            recommendation(brief.id, "mayhem").unwrap_or_else(|e| panic!("{}: {e}", brief.name));
        }
    }

    #[test]
    fn search_fields_cover_name_title_and_nickname() {
        let graves = champions()
            .into_iter()
            .find(|c| c.alias == "Graves")
            .expect("graves");
        assert_eq!(graves.name, "格雷福斯");
        assert_eq!(graves.title, "法外狂徒");
        assert!(graves.nicknames.iter().any(|n| n == "男枪"), "{:?}", graves.nicknames);

        // 每个英雄都应至少能按名称搜到
        for c in champions() {
            assert!(!c.name.is_empty());
            assert!(!c.title.is_empty());
        }
    }

    #[test]
    fn augment_tier_ranks_are_within_quality() {
        let rec = recommendation(222, "mayhem").expect("jinx");

        for quality in 1..=3u8 {
            let mut ranks: Vec<usize> = rec
                .augments
                .iter()
                .filter(|a| a.quality == quality)
                .map(|a| a.tier_rank)
                .collect();
            ranks.sort_unstable();
            assert_eq!(
                ranks,
                (1..=ranks.len()).collect::<Vec<_>>(),
                "品质 {quality} 的档内名次应从 1 连续编号"
            );
        }

        for augment in &rec.augments {
            let total = rec
                .augments
                .iter()
                .filter(|a| a.quality == augment.quality)
                .count();
            assert_eq!(augment.tier_total, total, "档内总数应与该品质数量一致");
        }
    }

    #[test]
    fn finds_augments_in_spaced_ocr_text() {
        let rec = recommendation(222, "mayhem").expect("jinx");
        let target = &rec.augments[0];

        // Windows OCR 会在每个汉字之间插空格，匹配前必须去掉
        let spaced: String = target
            .name
            .chars()
            .map(|c| c.to_string())
            .collect::<Vec<_>>()
            .join(" ");

        let ids = find_augments_in_text(&format!("xxx {spaced} yyy"));
        assert!(ids.contains(&target.id), "应识别出 {}", target.name);

        let picks = augment_picks(222, &ids, "mayhem");
        let hit = picks.iter().find(|p| p.id == target.id).expect("档内排名");
        assert!(hit.tier_total > 0);
        assert!(hit.tier_rank >= 1);
    }

    #[test]
    fn resolves_champion_by_alias() {
        assert_eq!(champion_id_by_alias_or_name("Jinx"), Some(222));
        assert_eq!(
            champion_id_by_alias_or_name("game_character_displayname_Jinx"),
            Some(222)
        );
        assert_eq!(champion_id_by_alias_or_name("金克丝"), Some(222));
        assert_eq!(champion_id_by_alias_or_name("卡牌大师"), Some(4));
        assert_eq!(
            champion_id_by_alias_or_name("game_character_displayname_TwistedFate"),
            Some(4)
        );
        assert_eq!(champion_id_by_alias_or_name("不存在"), None);
    }

    #[test]
    fn finds_champions_in_spaced_ocr_text() {
        // OCR 会在每个汉字之间插空格
        let ids = find_champions_in_text("xxx 金 克 丝 yyy 盖 伦 zzz");
        assert!(ids.contains(&222), "应识别出金克丝, got {ids:?}");

        let board = champion_board(&[222, 86]);
        assert_eq!(board.len(), 2);
        assert!(board.iter().all(|c| c.rank >= 1));
    }

    #[test]
    fn board_is_sorted_deduped_and_ranked() {
        // 1 = 安妮, 22 = 艾希；999999 不存在，应被忽略
        let rows = champion_board(&[1, 1, 22, 999_999]);

        assert!(rows.len() >= 2, "应至少返回两个真实英雄");
        assert!(rows.iter().all(|r| r.id != 999_999), "未知 id 应被忽略");
        assert_eq!(
            rows.iter().filter(|r| r.id == 1).count(),
            1,
            "重复 id 应去重"
        );
        assert!(
            rows.windows(2).all(|w| w[0].rank < w[1].rank),
            "必须按排名从强到弱排列"
        );

        for row in &rows {
            assert_eq!(Some(row.rank), RANK_OF.get(&row.id).copied());
        }
    }
}

