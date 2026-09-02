---
title: 拷贝赋值运算符
date: '2026-09-01 20:48:48'
updated: '2026-09-01 20:48:48'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 本文介绍了C++拷贝赋值运算符的标准声明形式、深拷贝的三个步骤（释放旧内存、分配新内存、拷贝内容）以及自我赋值检测的必要性与实现方法。
cover: /img/covers/c-c-mtinokoi.webp
copyright: true
cover_position: 53.7% 40.2%
---

## operator= 的声明形式

拷贝赋值运算符是一个特殊的成员函数，其声明必须遵循约定，才能支持连续赋值（如 a = b = c）并防止不必要的临时对象拷贝。

那么它的标准签名方式如下：

```cpp
class String {
public:
    // 拷贝赋值运算符的标准签名
    String& operator=(const String& other);
    // ...
};
```

## 深拷贝三部曲 — 释放旧内存 → 分配新内存 → 拷贝内容

赋值操作的目标对象已持有内存，因此不能像拷贝构造那样直接分配新内存。必须遵循“先释放、再分配、后拷贝”的严格顺序。

示例如下：

```cpp
String& String::operator=(const String& other) {
    // 1. 释放旧内存
    delete[] data;

    // 2. 分配新内存
    size = other.size;
    data = new char[size + 1];

    // 3. 拷贝内容
    strcpy(data, other.data);

    return *this;
}
```

## 自我赋值检测 

当对象被赋值给自身时（如 a = a），如果不做特殊处理，深拷贝三部曲会先释放自身的内存，再试图从已释放的内存中拷贝数据，导致未定义行为。

>自我赋值（self-assignment）。如果没有检测，delete[] data 会释放自身内存，随后 strcpy(data, other.data) 中的 other.data 指向已被释放的内存，导致悬空指针访问，程序崩溃或数据损坏。

```cpp
String& String::operator=(const String& other) {
    // 自我赋值检测
    if (this == &other) {
        return *this;  // 不做任何操作，直接返回
    }

    // 1. 释放旧内存
    delete[] data;

    // 2. 分配新内存
    size = other.size;
    data = new char[size + 1];

    // 3. 拷贝内容
    strcpy(data, other.data);

    return *this;
}
```

