"""LSTM 时序模型:根据近 WINDOW 期开奖号码预测下一期各号码出现概率。

号码编码:红球 n -> 向量下标 n-1;蓝球 m -> redMax + (m-1)(multi-hot)
模型:2 层 LSTM + 全连接 + Sigmoid,多标签 BCE 损失。
"""

import json
import math
import os
import random
import time

import numpy as np
import torch
import torch.nn as nn

MODELS_DIR = os.environ.get('ML_MODELS_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models'))
WINDOW = 10  # 时序窗口:用前 10 期预测下一期
HIDDEN = 64
MAX_EPOCHS = 150
PATIENCE = 15
SEED = 42


class LotteryLSTM(nn.Module):
    def __init__(self, input_size, hidden=HIDDEN):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size, hidden_size=hidden, num_layers=2,
            batch_first=True, dropout=0.1,
        )
        self.fc = nn.Sequential(
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Linear(hidden, input_size),
        )

    def forward(self, x):
        out, _ = self.lstm(x)
        last = out[:, -1, :]
        return torch.sigmoid(self.fc(last))


def _set_seed(seed=SEED):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def encode(draw, red_max):
    vec = np.zeros(red_max + 16, dtype=np.float32)  # 蓝球最大 16(双色球)
    # 注意:蓝球部分实际使用 blue_max 长度,由调用方切片
    for n in draw['reds']:
        vec[n - 1] = 1.0
    for m in draw['blues']:
        vec[red_max + m - 1] = 1.0
    return vec


def build_dataset(draws, red_max, blue_max, window=WINDOW):
    """draws: 旧→新 排序的开奖列表。返回 X (samples, window, dim)、y (samples, dim)"""
    dim = red_max + blue_max
    vecs = [encode(d, red_max)[:dim] for d in draws]
    X, y = [], []
    for t in range(window, len(vecs)):
        X.append(np.stack(vecs[t - window:t]))
        y.append(vecs[t])
    if not X:
        return None, None
    return np.stack(X), np.stack(y)


def _train(spec, draws, max_epochs=None, seed=SEED):
    """训练并返回 (model, meta)。不保存文件。"""
    _set_seed(seed)
    red_max, blue_max = spec['redMax'], spec['blueMax']
    dim = red_max + blue_max
    X, y = build_dataset(draws, red_max, blue_max)
    if X is None or len(X) < 30:
        raise ValueError(f'样本过少({0 if X is None else len(X)} 条),至少需要 30 条以上历史数据再训练')

    n_val = max(5, int(len(X) * 0.2))
    X_val, y_val = X[-n_val:], y[-n_val:]
    X_tr, y_tr = X[:-n_val], y[:-n_val]

    model = LotteryLSTM(dim)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = nn.BCELoss()

    X_tr_t = torch.tensor(X_tr)
    y_tr_t = torch.tensor(y_tr)
    X_val_t = torch.tensor(X_val)
    y_val_t = torch.tensor(y_val)

    best_val = math.inf
    best_state = None
    patience = 0
    history = []

    for epoch in range(1, (max_epochs or MAX_EPOCHS) + 1):
        model.train()
        opt.zero_grad()
        loss = loss_fn(model(X_tr_t), y_tr_t)
        loss.backward()
        opt.step()

        model.eval()
        with torch.no_grad():
            val_loss = loss_fn(model(X_val_t), y_val_t).item()
        history.append({'epoch': epoch, 'train': round(loss.item(), 5), 'val': round(val_loss, 5)})

        if val_loss < best_val - 1e-5:
            best_val = val_loss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            patience = 0
        else:
            patience += 1
            if patience >= PATIENCE:
                break

    if best_state is not None:
        model.load_state_dict(best_state)
    meta = {
        'window': WINDOW,
        'hidden': HIDDEN,
        'epochs': epoch,
        'samples': len(X),
        'trainSamples': len(X_tr),
        'valSamples': n_val,
        'finalTrainLoss': round(loss.item(), 5),
        'finalValLoss': round(best_val, 5),
        'history': history[:: max(1, len(history) // 20)],  # 抽样历史,避免过大
    }
    return model, meta


def train_model(lottery, spec, draws, epochs=None):
    """spec: {redMax, redCount, blueMax, blueCount};draws: 旧→新"""
    model, meta = _train(spec, draws, epochs)
    os.makedirs(MODELS_DIR, exist_ok=True)
    torch.save(model.state_dict(), os.path.join(MODELS_DIR, f'{lottery}.pt'))

    meta['lottery'] = lottery
    meta['spec'] = spec
    meta['trainedAt'] = time.strftime('%Y-%m-%d %H:%M:%S')
    with open(os.path.join(MODELS_DIR, f'{lottery}.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False)
    return meta


def load_model(lottery):
    meta_path = os.path.join(MODELS_DIR, f'{lottery}.json')
    model_path = os.path.join(MODELS_DIR, f'{lottery}.pt')
    if not (os.path.exists(meta_path) and os.path.exists(model_path)):
        return None
    with open(meta_path, encoding='utf-8') as f:
        meta = json.load(f)
    dim = meta['spec']['redMax'] + meta['spec']['blueMax']
    model = LotteryLSTM(dim, meta.get('hidden', HIDDEN))
    model.load_state_dict(torch.load(model_path, weights_only=True))
    model.eval()
    return model, meta


def predict_probs(lottery, draws):
    """draws: 旧→新。返回 (redProbs, blueProbs, meta)"""
    loaded = load_model(lottery)
    if loaded is None:
        raise ValueError(f'{lottery} 模型尚未训练')
    model, meta = loaded
    red_max, blue_max = meta['spec']['redMax'], meta['spec']['blueMax']
    if len(draws) < WINDOW:
        raise ValueError(f'至少需要最近 {WINDOW} 期数据才能预测')
    window = draws[-WINDOW:]
    dim = red_max + blue_max
    x = torch.tensor(np.stack([encode(d, red_max)[:dim] for d in window])[None, :, :])
    with torch.no_grad():
        probs = model(x).numpy()[0]
    red_probs = probs[:red_max]
    blue_probs = probs[red_max:]
    return red_probs, blue_probs, meta


# ---------- 基于概率的选号与过滤(与统计策略共用思想) ----------

def _weighted_pick(probs, count):
    available = list(enumerate(probs, start=1))
    picked = []
    while len(picked) < count and available:
        total = sum(w for _, w in available)
        r = random.random() * total
        acc = 0.0
        for i, (num, w) in enumerate(available):
            acc += w
            if r <= acc:
                picked.append(num)
                available.pop(i)
                break
        else:
            picked.append(available[-1][0])
            available.pop()
    return sorted(picked)


def _consecutive_groups(nums):
    groups, in_group = 0, False
    s = sorted(nums)
    for i in range(1, len(s)):
        if s[i] == s[i - 1] + 1:
            if not in_group:
                groups += 1
                in_group = True
        else:
            in_group = False
    return groups


def _valid_reds(spec, nums, latest_reds):
    lo, hi = 1, spec['redMax']
    total = sum(nums)
    avg = (lo + hi) / 2 * spec['redCount']
    if abs(total - avg) > avg * 0.45:
        return False
    odd = sum(1 for n in nums if n % 2 == 1)
    mid = (lo + hi) / 2
    big = sum(1 for n in nums if n >= mid)
    min_share = 2 if spec['redCount'] >= 6 else 1
    if odd < min_share or spec['redCount'] - odd < min_share:
        return False
    if big < min_share or spec['redCount'] - big < min_share:
        return False
    if _consecutive_groups(nums) > 1:
        return False
    if latest_reds and sorted(nums) == sorted(latest_reds):
        return False
    return True


def backtest(lottery, spec, draws, points=20, epochs=60):
    """Walk-forward 回测:对最近 `points` 期,每期用其之前全部数据重新训练并预测,
    统计模型 TOP-K 号码与实际开奖号码的命中情况,与随机基准对比。
    返回的指标是评估模型是否有效的最诚实方式。
    """
    red_max, blue_max = spec['redMax'], spec['blueMax']
    red_count, blue_count = spec['redCount'], spec['blueCount']
    dim = red_max + blue_max
    n = len(draws)
    points = min(points, n - WINDOW - 30)
    if points < 5:
        raise ValueError(f'数据不足以回测(需要至少 {WINDOW + 35} 期)')

    details = []
    for t in range(n - points, n):
        train_draws = draws[:t]
        window_in = draws[t - WINDOW:t]
        actual = draws[t]
        model, _ = _train(spec, train_draws, max_epochs=epochs, seed=SEED + t)
        x = torch.tensor(np.stack([encode(d, red_max)[:dim] for d in window_in])[None, :, :])
        model.eval()
        with torch.no_grad():
            probs = model(x).numpy()[0]

        red_probs, blue_probs = probs[:red_max], probs[red_max:]
        actual_reds = set(actual['reds'])
        actual_blues = set(actual['blues'])
        top_red = np.argsort(-red_probs)
        top_blue = np.argsort(-blue_probs)
        hits_top = sum(1 for i in top_red[:red_count] if (i + 1) in actual_reds)
        hits_top2 = sum(1 for i in top_red[:red_count * 2] if (i + 1) in actual_reds)
        blue_hits = sum(1 for i in top_blue[:3] if (i + 1) in actual_blues)
        details.append({
            'issue': actual['issue'],
            'hitsTop': hits_top,
            'hitsTop2': hits_top2,
            'blueHits': blue_hits,
        })

    # 随机基准:抽 red_count 个号,落在 top-K 的期望命中数 = red_count * K / red_max
    k = red_count
    baseline_top = round(red_count * k / red_max, 2)
    baseline_top2 = round(red_count * (k * 2) / red_max, 2)
    baseline_blue = round(blue_count * 3 / blue_max, 2)
    avg = lambda key: round(sum(d[key] for d in details) / len(details), 2)
    return {
        'lottery': lottery,
        'points': len(details),
        'epochsPerPoint': epochs,
        'redAvgHitsTopK': avg('hitsTop'),
        'redAvgHitsTop2K': avg('hitsTop2'),
        'blueAvgHitsTop3': avg('blueHits'),
        'baselineTopK': baseline_top,
        'baselineTop2K': baseline_top2,
        'baselineBlueTop3': baseline_blue,
        'details': details,
    }


def gen_bets(spec, red_probs, blue_probs, count, latest_reds=None):
    random.seed()  # 选号随机,训练固定
    bets, seen = [], set()
    attempts = 0
    while len(bets) < count and attempts < count * 50:
        attempts += 1
        reds = _weighted_pick(red_probs, spec['redCount'])
        if not _valid_reds(spec, reds, latest_reds):
            continue
        blues = _weighted_pick(blue_probs, spec['blueCount'])
        key = (tuple(reds), tuple(blues))
        if key in seen:
            continue
        seen.add(key)
        bets.append({'reds': reds, 'blues': blues, 'sum': sum(reds)})
    return bets
