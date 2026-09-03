---
title: LeetCode-Hot100：合并区间
date: '2026-09-03 22:49:28'
updated: '2026-09-03 22:49:28'
categories:
  - 学习笔记
tags:
  - 算法
  - 排序
  - 差分
description: 本文围绕 LeetCode “合并区间” 问题，依次介绍了暴力、排序后合并和基于坐标范围的差分三种解法，并给出了复杂度分析。
cover: /img/covers/e-aa-3-4-a-mtlmv9ch.webp
copyright: true
---

## 题目

![image](/img/posts/image-mtlmwtfh.png)

## 暴力

思路：依次处理每个区间，将它和当前结果中的所有区间比较。相交就合并，不相交就保留。
两个闭区间 [a,b] 和 [c,d] 不重叠的条件是：`b < c || d < a`

```cpp
class Solution {
public:
    vector<vector<int>> merge(vector<vector<int>>& intervals) {
        vector<vector<int>> result;

        for (auto cur : intervals) {
            vector<vector<int>> next;

            for (auto seg : result) {
                if (seg[1] < cur[0] || cur[1] < seg[0]) {
                    next.push_back(seg);
                } else {
                    cur[0] = min(cur[0], seg[0]);
                    cur[1] = max(cur[1], seg[1]);
                }
            }

            next.push_back(cur);
            result = move(next);
        }

        return result;
    }
};
```
复杂度：
- 时间：<code>O(n<sup>2</sup>)</code>
- 空间：`O(n)`

## 优化

思路：按照区间左端点排序。
排序后，当前区间只可能和结果中的最后一个区间重叠：
- 如果 当前左端点 <= 结果末尾右端点，合并；
- 否则开始一个新区间。

```cpp
class Solution {
public:
    vector<vector<int>> merge(vector<vector<int>>& intervals) {
        sort(intervals.begin(), intervals.end());

        vector<vector<int>> result;

        for (auto& cur : intervals) {
            if (result.empty() || result.back()[1] < cur[0]) {
                result.push_back(cur);
            } else {
                result.back()[1] = max(result.back()[1], cur[1]);
            }
        }

        return result;
    }
};
```

复杂度：
- 排序：`O(n log n)`
- 扫描：`O(n)`
- 总时间：`O(n log n)`
- 空间：`O(n)`，不考虑排序栈空间时为 `O(1)` 额外空间

## 最优

题目给出：![image](/img/posts/image-mtlmzwzn.png)

因此可以利用坐标范围较小这一特点。

但是直接在整数坐标上标记会错误处理：[1,1] 和 [2,2]

它们虽然整数点相邻，但连续区间意义下并不重叠。

解决办法：将坐标扩大两倍。

例如：[1,4] -> [2,8]，[4,5] -> [8,10]

这样端点相等时仍然连续，而 [1,1] 和 [2,2] 中间会留下空位。

```cpp
class Solution {
public:
    vector<vector<int>> merge(vector<vector<int>>& intervals) {
        const int MAX_X = 10000;
        vector<int> diff(2 * MAX_X + 2);

        for (auto& seg : intervals) {
            int left = 2 * seg[0];
            int right = 2 * seg[1];

            ++diff[left];
            --diff[right + 1]; // 闭区间，所以要 right + 1
        }

        vector<vector<int>> result;
        int cover = 0;
        int start = -1;

        for (int x = 0; x <= 2 * MAX_X + 1; ++x) {
            cover += diff[x];

            if (cover > 0 && start == -1) {
                start = x;
            }

            if (cover == 0 && start != -1) {
                int end = x - 1;
                result.push_back({start / 2, end / 2});
                start = -1;
            }
        }

        return result;
    }
};
```

复杂度：
- 时间：`O(n + U)`，其中 U = 10<sup>4</sup>
- 空间：`O(U)`

> 实际面试或算法题中，通常选择第二种排序解法

好久没有趣味评论小剧场了，补一期

## 趣味评论小剧场
> 面试现状
> 面试官：看简历了解到你有两年半的送外卖经验，可以简单的说一下平时是怎么送外卖的吗？
> 我：我首先在平台上接单，然后到店里取餐，取到餐后骑电动车到顾客留下的地址，再通知顾客取餐。

> 面试官：你们也用电动车配送吗？说一下电动车的运行原理。
> 我：电动车的工作原理是通过锂电池释放存储的电能经过电控系统将电能转化为电动车的机械能，然后电动机驱动电动车的机械结构从而推动电动车行驶。

> 面试官：锂电池具体是怎么把化学能转化为电能的呢？说一下锂电池化学成分以及反应方程式。
> 我：好的。锂电池把化学能转化为电能，本质上靠的是锂离子在正负极之间的定向迁移，同时让电子走外电路做功。
> 我以最常见的磷酸铁锂电池为例：结构上，它正极是磷酸铁锂，负极是石墨，中间是含锂盐的电解液，还有一层隔膜只让锂离子通过、不让电子通过。放电时，负极石墨里储存的锂原子特别‘活泼’，会自动失去电子变成锂离子进入电解液。这些电子沿着外部导线跑到正极，形成电流，就能驱动电机——这就是化学能变电能的过程。同时，锂离子穿过隔膜到达正极，和正极材料、电子结合，生成新的化合物。具体的反应方程式（用普通字母表示）是：
> 负极：LiC₆ → C₆ + Li⁺ + e⁻
> 正极：FePO₄ + Li⁺ + e⁻ → LiFePO₄
> 总反应：LiC₆ + FePO₄ → C₆ + LiFePO₄
> 充电时这些反应反向进行，把电能又存成化学能。
> 所以整个过程就是锂离子在正负极间来回‘搬家’，伴随电子在外电路流动，实现能量转换。

> 面试官：不错，基础还可以。那你平时有有没有关注电动车更底层的原理呢？你可不可以说一下 非厄米宇称-时间（PT）对称性 和 双向DC-DC变换器拓扑 在电动车中的作用原理？
> 我：啊？这个不太了解，不过我对这个很感兴趣，有机会一定仔细研究。
> 面试官：没关系，平时要多研究电动车的底层原理，这样才可以更好地送外卖。

> 面试官：你们平时送外卖用的是什么牌子的电动车？
> 我：新日

> 面试官：啊？可是我们团队用的是雅迪牌子的，这你能快速熟悉吗？看样子我们技术栈不太匹配呀！？
> 我：。。。。
> 面试官：你先回去等通知吧。
