---
title: 继承
date: '2026-09-16 21:58:00'
updated: '2026-10-28 15:21:35'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 介绍C++中public继承的"is-a"语义、子类对象的内存布局以及继承下的构造析构顺序与虚析构函数规则。
cover: /img/covers/e-c-mu45mysz.webp
copyright: true
---

前面已经说明了两种类间关系组合和委托，现在，我们要学习第三种也是面向对象编程中标志性的一种关系：继承。

## public继承的语义

定义： public继承代表一种逻辑上的“是一种”（is-a）关系。当类 Student 使用 public 方式继承类 Person 时，即断言：任何一个 Student 对象，同时也是一个 Person 对象。

语法：
```cpp
class Student : public Person { ... };
```

注意：只有 public 继承才表达“is-a”关系。private 和 protected 继承通常表达“根据某物实现出”，是组合的一种变体，而非真正的逻辑继承。

常见误解：继承只是为了复用代码，子类能调用父类函数即可。
正确认知：看到 class A : public B，必须能逻辑上断言“A是一种B”（如 Student 是一种 Person）。若逻辑不成立（如 Pencil : public Eraser），即使编译通过，设计也是错误的。继承首先是设计语言，其次才是复用工具。

## 子类对象的内存结构

核心概念：父类成分，在内存中，一个子类对象的内部，完整地包含了一个父类对象的所有数据成员，这部分称为“父类成分”。

![image](/img/posts/image-mu45yhna.png)

布局顺序：父类成分在低地址，子类新增成员紧接其后。父类指针 `Base* p = new Derived()` 指向子类对象的起始地址。

## 继承下的构造与析构顺序

构造顺序（由内而外）： 先调用父类构造函数初始化父类成分，再调用子类构造函数初始化子类新增部分。如同“先打地基，再盖房子”。

析构顺序（由外而内）： 先调用子类析构函数清理子类特有资源，再自动调用父类析构函数清理父类资源。如同“先拆房顶，再拆地基”。

```cpp
class Base {
public:
    Base()  { std::cout << "Base构造\n"; }
    ~Base() { std::cout << "Base析构\n"; }
};

class Derived : public Base {
public:
    Derived()  { std::cout << "Derived构造\n"; }
    ~Derived() { std::cout << "Derived析构\n"; }
};

// 输出顺序：
// Base构造 -> Derived构造 -> Derived析构 -> Base析构
```

## 析构函数必须为 virtual

核心规则： 如果类被设计为父类（即将被继承），其析构函数必须声明为 <span style="color:#287b86">virtual</span>。否则，通过父类指针删除子类对象时，将导致未定义行为（子类部分不会被正确析构）。

经验法则：只要类中有一个虚函数，析构函数就必须是 virtual。即使类中没有虚函数，但预期会被继承，也建议将析构函数声明为 virtual，以防范未来扩展。

```cpp
class Base {
public:
    virtual ~Base() = default;  // 正确的习惯
};

class Derived : public Base {
    int* data;
public:
    Derived() : data(new int[100]) {}
    ~Derived() override { delete[] data; }  // 正确释放子类资源
};

Base* p = new Derived();
delete p;  // ✅ 正确调用 Derived 析构函数
```

