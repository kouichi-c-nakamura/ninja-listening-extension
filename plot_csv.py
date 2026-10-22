# -*- coding: utf-8 -*-
import os
import tkinter as tk
from tkinter import filedialog, messagebox
import pandas as pd
import matplotlib.pyplot as plt

def select_and_plot():
    # Tkinter ルートウィンドウの初期化（前面非表示）
    root = tk.Tk()
    root.withdraw()

    # ファイル選択ダイアログ
    csv_path = filedialog.askopenfilename(
        title="Ninja Research Log (CSV) を選択してください",
        filetypes=[("CSV Files", "*.csv"), ("All Files", "*.*")]
    )

    if not csv_path:
        return

    try:
        df = pd.read_csv(csv_path)

        # 必須カラムの確認
        required_cols = ['StepIdx', 'PlaybackRate', 'VAS_Clarity']
        for col in required_cols:
            if col not in df.columns:
                messagebox.showerror("エラー", f"CSVに必須カラム '{col}' が存在しません。")
                return

        steps = df['StepIdx'].values
        clarity = df['VAS_Clarity'].values
        speed = df['PlaybackRate'].values

        # フォント設定: Arial を優先使用
        plt.rcParams['font.sans-serif'] = ['Arial', 'Helvetica', 'DejaVu Sans']
        plt.rcParams['font.family'] = 'sans-serif'

        # カラーコード
        clarity_color = '#E91E63'  # 鮮やかなピンク（Clarity）
        speed_color = '#00BCD4'    # シアン・水色（Speed）

        # 白バックの Figure を作成
        fig, ax1 = plt.subplots(figsize=(7.5, 4.2), dpi=200, facecolor='white')
        ax1.set_facecolor('white')

        # Speed 用の第2軸（右軸）
        ax2 = ax1.twinx()
        ax2.set_facecolor('none')

        # 両軸のスケールを完全同期
        # 第1y軸の 0%〜100% と 第2y軸の 0x〜2.0x を完全一致（50% = 1.0x）
        y1_min, y1_max = -5, 105
        y2_min, y2_max = -0.1, 2.1
        ax1.set_ylim(y1_min, y1_max)
        ax2.set_ylim(y2_min, y2_max)

        # グリッド破線（0%/0x, 50%/1.0x, 100%/2.0x の高さに配置）
        for y_c in [0, 50, 100]:
            ax1.axhline(y_c, color='#E5E5E5' if y_c != 50 else '#BBBBBB',
                        linestyle='--', linewidth=1.1, zorder=1)

        # 目盛り設定
        # 第1軸（Clarity）: 0%, 50%, 100%
        ax1.set_yticks([0, 50, 100])
        ax1.set_yticklabels(['0%', '50%', '100%'], color=clarity_color, fontweight='bold', fontsize=10.5)
        ax1.tick_params(axis='y', colors=clarity_color, length=3, pad=8)

        # 第2軸（Speed）: 0x, 1.0x, 2.0x
        ax2.set_yticks([0.0, 1.0, 2.0])
        ax2.set_yticklabels(['0x', '1.0x', '2.0x'], color=speed_color, fontweight='bold', fontsize=10.5)
        ax2.tick_params(axis='y', colors=speed_color, length=3, pad=8)

        # 1. Speed（シアン破線・四角マーカー・右軸）
        ax2.plot(steps, speed, color=speed_color, linestyle='--', linewidth=2.2,
                 marker='s', markersize=6, alpha=0.95, zorder=2)

        # 2. Clarity（ピンク実線・白抜き丸マーカー・左軸）
        ax1.plot(steps, clarity, color=clarity_color, linewidth=2.8,
                 marker='o', markersize=7.5, markerfacecolor='white',
                 markeredgecolor=clarity_color, markeredgewidth=2.2, zorder=3)

        # X軸（ステップ番号）
        ax1.set_xticks(steps)
        ax1.set_xticklabels(steps, color='#555555', fontsize=10.5, fontweight='bold')
        ax1.tick_params(axis='x', colors='#888888', length=4, width=1.2)

        # 枠線: 左右の縦軸線と下線を表示（上線のみ非表示）
        ax1.spines['left'].set_visible(True)
        ax1.spines['left'].set_color('#CCCCCC')
        ax1.spines['left'].set_linewidth(1.2)
        ax1.spines['bottom'].set_color('#CCCCCC')
        ax1.spines['bottom'].set_linewidth(1.2)
        ax1.spines['top'].set_visible(False)
        ax1.spines['right'].set_visible(False)

        ax2.spines['right'].set_visible(True)
        ax2.spines['right'].set_color('#CCCCCC')
        ax2.spines['right'].set_linewidth(1.2)
        ax2.spines['left'].set_visible(False)
        ax2.spines['top'].set_visible(False)
        ax2.spines['bottom'].set_visible(False)

        # 上部の凡例
        plt.text(0.12, 0.94, '● Clarity', transform=fig.transFigure,
                 color=clarity_color, fontweight='bold', fontsize=11.5)
        plt.text(0.70, 0.94, '■ Speed', transform=fig.transFigure,
                 color=speed_color, fontweight='bold', fontsize=11.5)

        plt.subplots_adjust(top=0.88, bottom=0.15, left=0.12, right=0.88)

        # 元のCSVと同じフォルダにPNG保存
        base_name = os.path.splitext(csv_path)[0]
        out_png_path = f"{base_name}_plot.png"
        plt.savefig(out_png_path, dpi=300, facecolor='white', bbox_inches='tight')
        plt.show()

        messagebox.showinfo("完了", f"グラフを保存しました:\n{out_png_path}")

    except Exception as e:
        messagebox.showerror("エラー", f"処理中にエラーが発生しました:\n{str(e)}")

if __name__ == '__main__':
    select_and_plot()