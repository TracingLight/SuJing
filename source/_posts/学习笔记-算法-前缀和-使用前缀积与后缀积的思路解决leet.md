---
title: LeetCode-Hot100：除了自己以外数组的乘积
date: '2026-09-10 22:18:42'
updated: '2026-09-10 22:18:42'
categories:
  - 学习笔记
tags:
  - 算法
  - 前缀和
description: 使用前缀积与后缀积的思路解决LeetCode“除自身以外数组的乘积”问题，并将空间复杂度优化至O(1)。
cover: /img/covers/e-aa-3-4-a-mtvl6y9z.webp
copyright: true
cover_position: 50.9% 33.9%
---

## 题目

![image](/img/posts/image-mtvlj5ac.png)

## 暴力

思路：对每个位置 i，遍历整个数组，跳过 nums[i]

```cpp
class SolutionBrute {
public:
    vector<int> productExceptSelf(vector<int>& nums) {
        int n = nums.size();
        vector<int> ans(n, 1);

        for (int i = 0; i < n; ++i) {
            for (int j = 0; j < n; ++j) {
                if (i != j) ans[i] *= nums[j];
            }
        }

        return ans;
    }
};
```

复杂度：
- 时间：<code>O(n<sup>2</sup>)</code>
- 额外空间：`O(1)`，不计返回数组

## 优化

思路：前缀积 + 后缀积

定义prefix[i]为 i 左边所有元素的乘积

定义suffix[i]为 i 右边所有元素的乘积

那么答案为`answer[i] = prefix[i] * suffix[i]`

```cpp
class SolutionPrefixSuffix {
public:
    vector<int> productExceptSelf(vector<int>& nums) {
        int n = nums.size();
        vector<int> prefix(n, 1), suffix(n, 1), ans(n);

        for (int i = 1; i < n; ++i)
            prefix[i] = prefix[i - 1] * nums[i - 1];

        for (int i = n - 2; i >= 0; --i)
            suffix[i] = suffix[i + 1] * nums[i + 1];

        for (int i = 0; i < n; ++i)
            ans[i] = prefix[i] * suffix[i];

        return ans;
    }
};
```

复杂度：
- 时间：`O(n)`
- 额外空间：`O(n)`

## 最优

思路：结果数组存前缀积，变量保存后缀积。不额外创建 prefix 和 suffix 数组。

第一遍：
- ans[i] 保存 i 左边的乘积

第二遍：
- 用变量 right 保存 i 右边的乘积
- 直接乘到 ans[i]

```cpp
class Solution {
public:
    vector<int> productExceptSelf(vector<int>& nums) {
        int n = nums.size();
        vector<int> ans(n, 1);

        int left = 1;
        for (int i = 0; i < n; ++i) {
            ans[i] = left;
            left *= nums[i];
        }

        int right = 1;
        for (int i = n - 1; i >= 0; --i) {
            ans[i] *= right;
            right *= nums[i];
        }

        return ans;
    }
};
```

复杂度：
- 时间：`O(n)`
- 额外空间：`O(1)`，返回数组不计入额外空间

