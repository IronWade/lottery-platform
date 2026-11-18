"""彩票深度学习服务(FastAPI)

运行: cd ml && .venv/Scripts/python.exe -m uvicorn app:app --host 127.0.0.1 --port 5001
"""

import os

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import lottery_lstm as lstm

app = FastAPI(title='Lottery DL Service')


class TrainRequest(BaseModel):
    lottery: str
    spec: dict  # {redMax, redCount, blueMax, blueCount}
    draws: list[dict] = Field(default_factory=list)  # 旧→新 排序


class PredictRequest(BaseModel):
    lottery: str
    spec: dict
    count: int = 5
    draws: list[dict] = Field(default_factory=list)  # 旧→新,用于预测窗口与过滤
    latestReds: list[int] = Field(default_factory=list)


class BacktestRequest(BaseModel):
    lottery: str
    spec: dict
    draws: list[dict] = Field(default_factory=list)  # 旧→新
    points: int = 20
    epochs: int = 60


def _check_spec(spec):
    for k in ('redMax', 'redCount', 'blueMax', 'blueCount'):
        if k not in spec:
            raise HTTPException(400, f'spec 缺少字段: {k}')


@app.get('/health')
def health():
    return {'ok': True, 'torch': torch.__version__, 'device': 'cuda' if torch.cuda.is_available() else 'cpu'}


@app.get('/status/{lottery}')
def status(lottery: str):
    meta_path = os.path.join(lstm.MODELS_DIR, f'{lottery}.json')
    if not os.path.exists(meta_path):
        return {'trained': False}
    import json
    with open(meta_path, encoding='utf-8') as f:
        meta = json.load(f)
    return {'trained': True, 'meta': meta}


@app.post('/train')
def train(req: TrainRequest):
    _check_spec(req.spec)
    if len(req.draws) < lstm.WINDOW + 30:
        raise HTTPException(400, f'历史数据不足({len(req.draws)} 期),请至少同步 {lstm.WINDOW + 30} 期以上')
    try:
        meta = lstm.train_model(req.lottery, req.spec, req.draws)
        return {'ok': True, 'meta': meta}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post('/predict')
def predict(req: PredictRequest):
    _check_spec(req.spec)
    try:
        red_probs, blue_probs, meta = lstm.predict_probs(req.lottery, req.draws)
    except ValueError as e:
        raise HTTPException(400, str(e))

    count = min(max(req.count, 1), 20)
    bets = lstm.gen_bets(req.spec, red_probs, blue_probs, count, req.latestReds)

    top_reds = sorted(range(1, req.spec['redMax'] + 1), key=lambda n: -red_probs[n - 1])
    top_blues = sorted(range(1, req.spec['blueMax'] + 1), key=lambda n: -blue_probs[n - 1])
    return {
        'ok': True,
        'meta': meta,
        'redProbs': [{'num': n, 'prob': round(float(red_probs[n - 1]), 4)} for n in top_reds],
        'blueProbs': [{'num': n, 'prob': round(float(blue_probs[n - 1]), 4)} for n in top_blues],
        'bets': bets,
    }


@app.post('/backtest')
def backtest(req: BacktestRequest):
    _check_spec(req.spec)
    points = min(max(req.points, 5), 40)
    epochs = min(max(req.epochs, 20), 100)
    try:
        return {'ok': True, 'result': lstm.backtest(req.lottery, req.spec, req.draws, points, epochs)}
    except ValueError as e:
        raise HTTPException(400, str(e))


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=int(os.environ.get('ML_PORT', '5001')))
