---
title: const关键字
date: '2026-07-30 05:50:19'
updated: '2026-07-30 05:53:14'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 本文介绍了C++中const关键字在类中的应用，包括const对象的定义与特性，以及const成员函数的声明、设计原则与匹配规则。
cover: /img/covers/a-e-o-ms73h299.webp
copyright: true
cover_position: 56.4% 21.3%
---

## const对象

含义：用 `const` 关键字修饰的类对象。其数据成员在对象的整个生命周期内都不可被修改。

语法位置： `const` 关键字位于对象类型之前。

> // 示例：创建一个常量复数对象c1
> const Complex c1(2, 1);
> // 其数据（实部2，虚部1）在对象生命周期内不可变

`const` 可以修饰变量（基本类型），也可以修饰对象（类类型）。其核心含义都是“只读”。对于对象而言，“只读”意味着其所有非静态数据成员都不可被修改。

## const成员函数

在成员函数声明的参数列表后、函数体花括号前添加 `const` 关键字。

该函数向编译器和使用者做出承诺不会修改调用它的那个对象（即`*this`）的任何非静态数据成员。

语法位置： `返回类型 函数名(参数列表) const { /* 函数体 */ }`

```cpp
class Complex {
private:
    double re, im;
public:
    // const成员函数示例：承诺不修改对象状态，仅返回实部值
    double real() const { return re; }
    // 非const成员函数示例：会修改对象状态
    void set_real(double r) { re = r; }
};
```

![image](/img/posts/image-ms73ei09.png)

设计原则：只要逻辑上不修改对象数据，“马上加上const”。这是一个应该在设计接口（interface）时就确定的决策.

const成员函数与const对象的匹配（编译器安全检查）

规则： 常量对象只能调用常量成员函数

![image](/img/posts/image-ms73gkw9.png)





