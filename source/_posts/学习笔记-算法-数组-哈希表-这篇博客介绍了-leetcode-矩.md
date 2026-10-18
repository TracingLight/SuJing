---
title: LeetCode-Hot1100：矩阵置零
date: '2026-09-16 23:01:18'
updated: '2026-09-18 23:07:43'
categories:
  - 学习笔记
tags:
  - 算法
  - 数组
  - 哈希表
description: 这篇博客介绍了 LeetCode 矩阵置零问题的三种解法，从暴力记录零元素位置到利用首行首列实现 O(1) 额外空间的最优解。
cover: /img/covers/e-aa-3-4-a-mu487zs1.webp
copyright: true
cover_position: 50.9% 33.9%
---

## 题目

![image](/img/posts/image-mu73ejah.png)

## 暴力

思路： 先记录所有零元素的位置，再遍历矩阵，将对应行和列置为 0。

```cpp
class Solution {
public:
    void setZeroes(vector<vector<int>>& matrix) {
        int m = matrix.size();
        int n = matrix[0].size();

        vector<pair<int, int>> zeros;

        for (int i = 0; i < m; ++i) {
            for (int j = 0; j < n; ++j) {
                if (matrix[i][j] == 0) {
                    zeros.push_back({i, j});
                }
            }
        }

        for (auto [r, c] : zeros) {
            for (int j = 0; j < n; ++j) {
                matrix[r][j] = 0;
            }

            for (int i = 0; i < m; ++i) {
                matrix[i][c] = 0;
            }
        }
    }
};
```

复杂度：
- 时间：`O(mn + k(m+n))`，k 为零元素个数
- 空间：`O(k)`

## 优化

思路： 使用两个数组分别记录需要置零的行和列，最后统一修改矩阵。

```cpp
class Solution {
public:
    void setZeroes(vector<vector<int>>& matrix) {
        int m = matrix.size();
        int n = matrix[0].size();

        vector<bool> rows(m, false);
        vector<bool> cols(n, false);

        for (int i = 0; i < m; ++i) {
            for (int j = 0; j < n; ++j) {
                if (matrix[i][j] == 0) {
                    rows[i] = true;
                    cols[j] = true;
                }
            }
        }

        for (int i = 0; i < m; ++i) {
            for (int j = 0; j < n; ++j) {
                if (rows[i] || cols[j]) {
                    matrix[i][j] = 0;
                }
            }
        }
    }
};
```

复杂度：
- 时间：`O(mn)`
- 空间：`O(m+n)`

## 最优

思路： 使用矩阵的第一行和第一列记录对应行列是否需要置零，并单独记录第一行、第一列原本是否含零。

```cpp
class Solution {
public:
    void setZeroes(vector<vector<int>>& matrix) {
        int m = matrix.size();
        int n = matrix[0].size();

        bool firstRowZero = false;
        bool firstColZero = false;

        for (int j = 0; j < n; ++j) {
            if (matrix[0][j] == 0) {
                firstRowZero = true;
            }
        }

        for (int i = 0; i < m; ++i) {
            if (matrix[i][0] == 0) {
                firstColZero = true;
            }
        }

        for (int i = 1; i < m; ++i) {
            for (int j = 1; j < n; ++j) {
                if (matrix[i][j] == 0) {
                    matrix[i][0] = 0;
                    matrix[0][j] = 0;
                }
            }
        }

        for (int i = 1; i < m; ++i) {
            for (int j = 1; j < n; ++j) {
                if (matrix[i][0] == 0 || matrix[0][j] == 0) {
                    matrix[i][j] = 0;
                }
            }
        }

        if (firstRowZero) {
            for (int j = 0; j < n; ++j) {
                matrix[0][j] = 0;
            }
        }

        if (firstColZero) {
            for (int i = 0; i < m; ++i) {
                matrix[i][0] = 0;
            }
        }
    }
};
```

复杂度：
- 时间：`O(mn)`
- 空间：`O(1)` 額外空间
