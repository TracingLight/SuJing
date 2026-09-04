---
title: LeetCode-Hot100：轮转数组
date: '2026-09-04 22:22:10'
updated: '2026-09-04 22:22:10'
categories:
  - 学习笔记
tags:
  - 算法
  - 数组
description: 介绍LeetCode轮转数组问题的三种解法，包括暴力移位、额外数组以及三次反转的最优实现。
cover: /img/covers/e-aa-3-4-a-mtn132pa.webp
copyright: true
---

## 题目

![image](/img/posts/image-mtn1c1mg.png)

## 暴力

思路：执行 k 次单步右移。

```cpp
class Solution {
public:
    void rotate(vector<int>& nums, int k) {
        int n = nums.size();
        k %= n;

        while (k--) {
            int last = nums[n - 1];

            for (int i = n - 1; i > 0; --i) {
                nums[i] = nums[i - 1];
            }

            nums[0] = last;
        }
    }
};
```

复杂度：
- 时间：`O(nk)`
- 空间：`O(1)`

## 优化

对于原数组下标 i，右移 k 位后新位置为：`(i + k) % n`

例如：`nums[i] -> result[(i + k) % n]`

```cpp
class Solution {
public:
    void rotate(vector<int>& nums, int k) {
        int n = nums.size();
        k %= n;

        vector<int> result(n);

        for (int i = 0; i < n; ++i) {
            result[(i + k) % n] = nums[i];
        }

        nums = move(result);
    }
};
```

复杂度：
- 时间：`O(n)`
- 空间：`O(n)`

## 最优

右移 k 位可以分成两部分：
原数组 = 左半部分 + 右半部分
结果   = 右半部分 + 左半部分

例如：[1,2,3,4,5,6,7], k = 3
先整体反转：[7,6,5,4,3,2,1]
再分别反转前 k 个元素和剩余元素：[5,6,7] + [1,2,3,4]

```cpp
class Solution {
public:
    void rotate(vector<int>& nums, int k) {
        int n = nums.size();
        k %= n;

        reverse(nums.begin(), nums.end());
        reverse(nums.begin(), nums.begin() + k);
        reverse(nums.begin() + k, nums.end());
    }
};
```

复杂度：
- 时间：`O(n)`
- 空间：`O(1)`



