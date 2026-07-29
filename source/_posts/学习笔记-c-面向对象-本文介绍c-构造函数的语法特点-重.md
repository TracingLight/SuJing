---
title: 从无到有：构造函数和初始化
date: '2026-07-28 06:40:08'
updated: '2026-07-28 06:40:08'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 本文介绍C++构造函数的语法特点，重点对比初始化列表与函数体内赋值的差异与优劣。
cover: /img/covers/c-c-1-4c-1-2a-ms49l4mq.webp
copyright: true
cover_position: 41.9% 31.1%
---

在前面的学习中，我们知道了如何定义类、设置访问级别来保护数据。但类实例（对象）在创建时，如何保证它的数据成员一开始就处于合理状态？这就引出了本篇的核心问题：如何通过构造函数优雅地完成对象的初始化？ 我们将从构造函数的特殊语法入手，并对比两种初始化方式的优劣。

## 构造函数的语法核心

构造函数是 C++ 中一种特殊的成员函数，在创建对象时自动被调用，用于初始化对象的数据成员。

那么它具备以下几个特点：

![image](/img/posts/image-ms49rtxz.png)

实例分析：复数类 Complex

```cpp
class Complex {
public:
    // 构造函数，带默认参数
    Complex(double r = 0.0, double i = 0.0) : real(r), imag(i) {}
private:
    double real;
    double imag;
};
创建对象时：Complex c1; 使用默认值 (0,0)；Complex c2(3.0, 4.0); 使用指定值。
```

> 编译器通过名称和参数列表来识别构造函数，这是编译期多态的基础之一。
> 函数名唯一性：其他函数不允许使用类名作为函数名。
> 如果写了返回类型，将不再是构造函数，而是普通成员函数。

## 初始化列表 vs 函数体内赋值

构造函数提供了两种初始化数据成员的方式：**初始化列表**（在函数体之前）和**函数体内赋值**。两者在效率和语义上存在显著差异。

![image](/img/posts/image-ms4a8s79.png)

初始化列表的执行顺序由成员在类中声明的顺序决定，而非列表中的书写顺序。函数体内赋值则是在所有成员初始化完成后才执行。

代码对比：

```cpp
// 推荐：初始化列表
class Complex {
public:
    Complex(double r, double i) 
        : real(r), imag(i) {}  // 直接初始化
private:
    double real, imag;
};
```

```cpp
// 不推荐：函数体内赋值
class Complex {
public:
    Complex(double r, double i) {
        real = r;  // 先默认构造，再赋值
        imag = i;
    }
private:
    double real, imag;
};
```

