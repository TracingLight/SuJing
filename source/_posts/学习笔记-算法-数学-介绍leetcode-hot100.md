---
title: LeetCode-Hot100：旋转图像
date: '2026-11-06 23:11:06'
updated: '2026-11-06 23:11:06'
categories:
  - 学习笔记
tags:
  - 算法
  - 数学
description: 介绍LeetCode Hot100“旋转图像”题的三种解法：暴力复制、转置加翻转、四元素环轮换，并分析各自的时间与空间复杂度。
cover: /img/covers/e-aa-3-4-a-mw53we3d.webp
copyright: true
---

## 题目

![image](/img/posts/image-mw53xnce.png)

{% annotation "此题核心规律为顺时针旋转 90° 后，原来位置 (i, j) 上的元素会移动到 (j, n-1-i)，下面三种写法都基于这一条规律" %}先看此处{% endannotation %}

## 暴力

思路：先把原矩阵复制一份，然后按公式把每个元素放到新位置

```cpp
class Solution {
public:
    void rotate(vector<vector<int>>& matrix) {
        int n = matrix.size();
        auto t = matrix;
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                matrix[j][n - 1 - i] = t[i][j];
    }
};
```

时间 `O(n²)`

空间 `O(n²)`

## 优化

思路：先沿主对角线转置，`(i, j)` 变成 `(j, i)`，再把每一行左右翻转，`(j, i) `变成 `(j, n-1-i)`，两步合起来正好是顺时针旋转 90°

```cpp
class Solution {
public:
    void rotate(vector<vector<int>>& matrix) {
        int n = matrix.size();
        for (int i = 0; i < n; i++)
            for (int j = i + 1; j < n; j++)
                swap(matrix[i][j], matrix[j][i]);
        for (auto& row : matrix)
            reverse(row.begin(), row.end());
    }
};
```

时间 `O(n²)`

空间 `O(1)`

## 最优

思路：每个元素转 4 次会回到原位，所以四个位置构成一个环

`(i,j) → (j,n-1-i) → (n-1-i,n-1-j) → (n-1-j,i) → (i,j)`

只需遍历左上角那 1/4 区域，每次用一个临时变量把环上的四个元素轮换一格

```cpp
class Solution {
public:
    void rotate(vector<vector<int>>& matrix) {
        int n = matrix.size();
        for (int i = 0; i < n / 2; i++)
            for (int j = 0; j < (n + 1) / 2; j++) {
                int t = matrix[i][j];
                matrix[i][j] = matrix[n - 1 - j][i];
                matrix[n - 1 - j][i] = matrix[n - 1 - i][n - 1 - j];
                matrix[n - 1 - i][n - 1 - j] = matrix[j][n - 1 - i];
                matrix[j][n - 1 - i] = t;
            }
    }
};
```

时间 `O(n²)`

空间 `O(1)`

虽然它和方法二的复杂度相同，但区别于每个元素只被移动一次，是最优的


