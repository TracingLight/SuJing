---
title: LeetCode-Hot100：最大子数组和
date: '2026-09-01 21:56:21'
updated: '2026-09-01 22:47:40'
categories:
  - 学习笔记
tags:
  - 算法
  - 动态规划
  - Kadane算法
description: 本文介绍了LeetCode Hot100中“最大子数组和”问题，并给出了从暴力枚举到动态规划及Kadane算法的多种解法与优化思路。
cover: /img/covers/e-aa-3-4-a-mtiqcpnn.webp
copyright: true
cover_position: 50.9% 28.3%
---

## 题目

![image](/img/posts/image-mtiqsu2z.png)

## 暴力

思路：枚举所有连续子数组的左右端点：
- 枚举起点 i
- 枚举终点 j
- 再计算 `nums[i...j]` 的和
如果每次都重新计算区间和，需要三层循环。

```cpp
class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        int n = nums.size();
        int ans = INT_MIN;

        for (int left = 0; left < n; left++) {
            for (int right = left; right < n; right++) {
                int sum = 0;

                for (int k = left; k <= right; k++) {
                    sum += nums[k];
                }

                ans = max(ans, sum);
            }
        }

        return ans;
    }
};
```

时间复杂度：`O(n<sup>3</sup>)`
空间复杂度：`O(1)`

## 优化

思路：暴力法中，区间 [left, right] 的和是重复计算的。

例如：`[left, right] 的和= nums[left] + ... + nums[right - 1] + nums[right]`

当固定起点 left 后，可以不断扩展终点 right，动态维护当前区间和：`sum += nums[right];`

```cpp
class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        int n = nums.size();
        int ans = INT_MIN;

        for (int left = 0; left < n; left++) {
            int sum = 0;

            for (int right = left; right < n; right++) {
                sum += nums[right];
                ans = max(ans, sum);
            }
        }

        return ans;
    }
};
```

时间复杂度：`O(n<sup>2</sup>)`
空间复杂度：`O(1)`

## 最优

思路：定义`dp[i]：以 nums[i] 结尾的最大子数组和`

对于 nums[i]，以它结尾的最大子数组只有两种选择：

选择一：接在之前的子数组后面`dp[i - 1] + nums[i]`

选择二：重新从 nums[i] 开始`nums[i]`

因此：`dp[i] = max(nums[i], dp[i - 1] + nums[i])`

最后答案是所有 `dp[i]` 中的最大值。

```cpp
class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        int n = nums.size();
        vector<int> dp(n);

        dp[0] = nums[0];
        int ans = dp[0];

        for (int i = 1; i < n; i++) {
            dp[i] = max(nums[i], dp[i - 1] + nums[i]);
            ans = max(ans, dp[i]);
        }

        return ans;
    }
};
```

时间复杂度：`O(n)`
空间复杂度：`O(n)`

## 空间优化后的 Kadane 算法

因为 `dp[i]` 只依赖 `dp[i - 1]`，不需要保存整个数组，只保留前一个状态即可。

```cpp
class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        int current = nums[0];
        int ans = nums[0];

        for (int i = 1; i < nums.size(); i++) {
            current = max(nums[i], current + nums[i]);
            ans = max(ans, current);
        }

        return ans;
    }
};
```

时间复杂度：`O(n)`
空间复杂度：`O(1)`

分治法较为复杂，留空，之后补
