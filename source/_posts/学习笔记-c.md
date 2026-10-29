---
title: extern "C"
date: '2026-10-29 21:43:04'
updated: '2026-10-29 22:30:15'
categories:
  - 学习笔记
tags:
  - C++
description: >-
  `extern "C"` 是C++中用于让被修饰内容按C语言规则编译和链接的编译指令，本文通过名称修饰规则与链接器工作原理，解释了C与C++互相调用时出现undefined
  reference链接错误的原因，并介绍了`extern "C"`的四种使用方式及常见跨语言调用场景。
cover: /img/covers/c-c-1-2-a-mvtl6h1a.webp
copyright: true
cover_position: 96.0% 4.6%
---

在跨语言混合编程的工程实践中（如C++调用C写的驱动接口），可能常常会看见链接错误即`undefined reference`的问题，那么为什么C和C++互相调用时，代码明明写了、头文件也包含了，链接器却报”找不到函数”？

## 名称修饰规则

名称修饰 `Name Mangling`

C++编译器在编译阶段，将函数名与参数信息（参数类型、个数、命名空间等）按照特定规则混合编码，生成一个全局唯一的符号名。

这点在[函数重载：同名函数如何共存？](/2026/07/28/学习笔记-c-面向对象-5/)这篇中提及到相关问题。

![image](/img/posts/image-mvtlcdbe.png)

如下面这段代码：

```cpp
#include <iostream>
//?func@@YAXH@Z (void __cdecl func(int))
void func(int a)
{
	std::cout << a << std::endl;
}
int main()
{
	func(5);
	return 0;
}
```

![image](/img/posts/image-mvtlfcik.png)


![image](/img/posts/image-mvtmuoky.png)

可以看到C++的函数名对应的并非func 

而我们加上extern "C"

![image](/img/posts/image-mvtmkz2w.png)

![image](/img/posts/image-mvtml3ki.png)

即可看到C语言编译器在编译函数时，不对函数名做任何修改

![image](/img/posts/image-mvtmmrkm.png)

`extern "C"`本质上是一个编译指令（不是函数，也不是变量），它告诉 C++ 编译器：被它修饰的内容，按照 C 语言的规则进行编译和链接，它的四种使用方式如下：
- 修饰单个函数
```cpp
extern "C" int function_c(int a);
```
最简单直接的用法，在函数声明前加上 extern "C" 即可
- 批量修饰（大括号）
```cpp
extern "C" {
    int function_c(int a);
    void function_d(double b);
}
```
用大括号将多个函数声明包裹起来，一次性修饰多个函数，适用于声明一批 C 语言接口的场景
- 修饰变量
```cpp
extern "C" int global_variable;
```
全局变量同样会受到名称修饰影响，使用 extern "C" 确保变量名与 C 语言一致
- 修饰整个头文件
```cpp
#ifdef __cplusplus
extern "C" {
#endif

// 头文件内容...

#ifdef __cplusplus
}
#endif
```
最常用的方式，使用 #ifdef __cplusplus 条件编译，使得同一个头文件既能被 C++ 编译器按 C 规则处理，又能被 C 编译器正常编译。

虽然 extern "C" 功能强大，但它并非万能，它并不能修饰类的成员函数和重载函数

![image](/img/posts/image-mvtmso8y.png)

## 链接器工作原理

链接器 `Linker`:将多个目标文件（.o / .obj）和库文件合并成最终可执行文件的工具
符号表 `Symbol Table`:每个目标文件中都有一张符号表，记录了已定义符号和未定义符号

下面是链接过程

![image](/img/posts/image-mvtmy3pu.png)

## 常见的跨语言调用场景

在实际工程中，C和C++的互相调用并不是"炫技"，而是被现实需求驱动的，以下三类场景最为常见

![image](/img/posts/image-mvtmz1kl.png)

为什么底层接口总是C风格？

![image](/img/posts/image-mvtmzg0l.png)

正是因为C语言作为"通用二进制接口标准"的地位，`extern "C"` 在逆向开发、嵌入式开发、驱动开发中不可或缺
