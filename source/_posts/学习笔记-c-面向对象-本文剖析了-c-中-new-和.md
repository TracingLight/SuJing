---
title: new和delete的内部机制
date: '2026-09-02 19:15:43'
updated: '2026-09-02 19:32:55'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 本文剖析了 C++ 中 new 和 delete 表达式的内部机制，将其分解为原始内存分配、类型转换、构造/析构调用与释放内存的底层步骤。
cover: /img/covers/c-e-c-a-mtjzjoxs.webp
copyright: true
cover_position: 53.7% 45.7%
---

## 分配原始内存【operator new】

核心概念：当编译器遇到 `new Complex(1,2)` 表达式时，并不会直接调用 `malloc`，而是先将其转化为对 <span style="color:#6600ff">operator new</span> 函数的调用。这个函数是 C++ 标准库提供的全局函数，内部本质上就是调用 `malloc` 来申请一块未初始化、未构造的原始内存（raw memory）。

大小参数：`operator new` 接受 `size_t` 参数，编译器根据 `sizeof(类型)` 自动生成，例如 `sizeof(Complex)` 为两个 `double`（通常 16 字节或更大）。

等价表达：`new Complex(args)` 的第一步 ≈ `void* p = operator new(sizeof(Complex));` 而 `operator new ≈ void* p = malloc(sizeof(Complex));`

公式化表示，new 表达式的第一步完全等价于以下两个调用的组合，揭示了 C++ 对 C 语言内存管理函数的封装层次：

```cpp
// 编译器的视角：new Complex(args) 中的第一步
void* p = operator new(sizeof(Complex));  // C++ 标准库函数
// operator new 内部实现 ≈
void* p = malloc(sizeof(Complex));        // 只分配原始内存，不调用构造函数
```

> 关键区分：malloc 分配的是未初始化的原始内存，不会调用任何构造函数。

## 类型转换【static_cast】

核心概念：<span style="color:#6600ff">operator new</span> 返回的是 `void*`（无类型指针），而我们需要的是指向特定类型（如 `Complex*`）的指针，以便后续调用构造函数以及用户使用。第二步是一个纯编译期完成的类型转换，由编译器插入一条 `static_cast` 指令。

```cpp
void* temp = operator new(sizeof(Complex));
Complex* pc = static_cast(temp);  // 编译期类型转换，不修改指针值
```

> 很多人误以为第二步是“强制类型转换”（C风格），但实际上 C++ 提倡使用 static_cast，它比 C 风格转换更安全、语义更明确。

## 构造函数调用

核心概念： 第三步通过第二步得到的类型化指针 <span style="color:#6600ff">pc</span>，调用类的构造函数。构造函数是一个成员函数，它通过隐藏的 <span style="color:#d75a4a">this</span> 指针 来访问对象的内存。编译器会将构造函数调用翻译为：`pc->Complex::Complex(args);`，其中 `this` 指针被设置为 `pc`（即刚分配的那块内存的起始地址）。

整个 new 表达式的语义可以被精确分解为以下三个独立步骤的串联，每一步都是不可跳过的编译期转换：

```cpp
// new Complex(1,2) 的完整编译器分解
void* mem = operator new(sizeof(Complex));          // 步骤1：分配原始内存
Complex* pc = static_cast(mem);            // 步骤2：类型转换
pc->Complex::Complex(1,2);                           // 步骤3：调用构造函数（通过 this 指针）
```

## 析构与释放

对称结构：<span style="color:#6600ff">delete pc;</span> 表达式被编译器分解为两步，顺序与 new 恰好相反：先调用析构函数（清理对象内部动态资源），再释放原始内存（通过 <span style="color:#6600ff">operator delete</span>，内部调用 <span style="color:#6600ff">free</span>）。

![image](/img/posts/image-mtk02en7.png)

